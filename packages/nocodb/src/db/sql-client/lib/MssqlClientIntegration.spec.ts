jest.mock('~/utils', () => ({ T: { emit: jest.fn() } }));
jest.mock('./mysql/MysqlClient', () => ({ __esModule: true, default: class MysqlClient {} }));
jest.mock('./mysql/TidbClient', () => ({ __esModule: true, default: class TidbClient {} }));
jest.mock('./mysql/VitessClient', () => ({ __esModule: true, default: class VitessClient {} }));
jest.mock('./pg/PgClient', () => ({ __esModule: true, default: class PgClient {} }));
jest.mock('./pg/YugabyteClient', () => ({ __esModule: true, default: class YugabyteClient {} }));
jest.mock('./sqlite/SqliteClient', () => ({ __esModule: true, default: class SqliteClient {} }));

jest.mock('~/helpers/resolveSslFileConfig', () => ({
  resolveSslFileConfig: jest.fn(async () => undefined),
}));

const { SqlClientFactory } = require('./SqlClientFactory');

const describeMssql =
  process.env.NC_TEST_MSSQL === 'true' ? describe : describe.skip;

describeMssql('MSSQL external data source', () => {
  jest.setTimeout(120_000);

  const tableName = 'nc_mssql_smoke';

  const createClient = () =>
    SqlClientFactory.create({
      client: 'mssql',
      connection: {
        host: process.env.MSSQL_HOST || '127.0.0.1',
        port: Number(process.env.MSSQL_PORT || 1433),
        user: process.env.MSSQL_USER || 'sa',
        password: process.env.MSSQL_PASSWORD || 'NocoDB_SQL_2026!',
        database: process.env.MSSQL_DATABASE || 'master',
        options: {
          encrypt: false,
          trustServerCertificate: true,
        },
      },
      searchPath: ['dbo'],
      pool: {
        min: 0,
        max: 2,
      },
    });

  async function waitForConnection(client: any) {
    let lastResult: any;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      lastResult = await client.testConnection();
      if (lastResult.code === 0) return;

      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }

    throw new Error(
      `SQL Server did not become ready: ${lastResult?.message || 'unknown error'}`,
    );
  }

  it('connects, introspects metadata, and reads/writes records', async () => {
    const client = createClient();

    try {
      await waitForConnection(client);

      const version = await client.version();
      expect(version.code).toBe(0);
      expect(version.data.object.version).toBeTruthy();

      await client.knex.schema.withSchema('dbo').dropTableIfExists(tableName);
      await client.knex.schema.withSchema('dbo').createTable(tableName, (table) => {
        table.increments('id');
        table.specificType('name', 'nvarchar(255)').notNullable().unique();
      });

      await client.knex(tableName).withSchema('dbo').insert({ name: 'sql-server-ok' });

      const rows = await client.knex(tableName).withSchema('dbo').select('*');
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('sql-server-ok');

      const tables = await client.tableList({ schema: 'dbo' });
      expect(tables.data.list.some((table: any) => table.tn === tableName)).toBe(
        true,
      );

      const columns = await client.columnList({
        schema: 'dbo',
        tn: tableName,
      });
      const id = columns.data.list.find((column: any) => column.cn === 'id');
      const name = columns.data.list.find((column: any) => column.cn === 'name');

      expect(id).toMatchObject({
        dt: 'int',
        pk: true,
        ai: true,
      });
      expect(name).toMatchObject({
        dt: 'nvarchar',
        rqd: true,
        unique: true,
      });
    } finally {
      await client.knex.schema.withSchema('dbo').dropTableIfExists(tableName);
      await client.knex.destroy();
    }
  });
});
