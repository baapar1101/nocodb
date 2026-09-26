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
const MssqlClient = require('./mssql/MssqlClient').default;

describe('SqlClientFactory MSSQL', () => {
  const makeKnex = () => ({
    raw: jest.fn(),
    schema: {
      withSchema: jest.fn(),
    },
  });

  it('creates an MSSQL client', () => {
    const knex = makeKnex();

    const client = SqlClientFactory.create({
      client: 'mssql',
      connection: {
        host: 'localhost',
        port: 1433,
        user: 'sa',
        password: 'Password123!',
        database: 'master',
      },
      knex,
    });

    expect(client).toBeInstanceOf(MssqlClient);
  });

  it('tests an MSSQL connection using the configured Knex client', async () => {
    const knex = makeKnex();
    knex.raw.mockResolvedValue([{ data: 2 }]);

    const client = SqlClientFactory.create({
      client: 'mssql',
      connection: {
        host: 'localhost',
        port: 1433,
        user: 'sa',
        password: 'Password123!',
        database: 'master',
      },
      knex,
    });

    const result = await client.testConnection();

    expect(result.code).toBe(0);
    expect(knex.raw).toHaveBeenCalledWith('SELECT 1 + 1 AS data');
  });

  it('uses the configured SQL Server schema for table introspection', async () => {
    const knex = makeKnex();
    knex.raw.mockResolvedValue([]);

    const client = SqlClientFactory.create({
      client: 'mssql',
      connection: {
        host: 'localhost',
        port: 1433,
        user: 'sa',
        password: 'Password123!',
        database: 'app',
      },
      searchPath: ['sales'],
      knex,
    });

    await client.tableList({});

    expect(knex.raw).toHaveBeenCalledWith(
      expect.stringContaining('FROM sys.tables'),
      ['sales'],
    );
  });
});
