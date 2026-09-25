import { SqlClientFactory } from './SqlClientFactory';
import MssqlClient from './mssql/MssqlClient';

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
