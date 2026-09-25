import KnexClient from '../KnexClient';
import Debug from '../../../util/Debug';
import Result from '../../../util/Result';
import { NcError } from '~/helpers/ncError';

const log = new Debug('MssqlClient');

class MssqlClient extends KnexClient {
  constructor(connectionConfig: any) {
    super(connectionConfig);
    this._version = {};
  }

  private getEffectiveSchema(args: any = {}) {
    return (
      args?.schema ||
      this.connectionConfig?.searchPath?.[0] ||
      this.connectionConfig?.schema ||
      'dbo'
    );
  }

  private extractRows(response: any): any[] {
    if (!response) return [];
    if (Array.isArray(response)) {
      if (response.length === 2 && Array.isArray(response[0])) {
        return response[0];
      }
      return response;
    }
    if (Array.isArray(response.rows)) return response.rows;
    if (Array.isArray(response.recordset)) return response.recordset;
    return [];
  }

  private unsupported(operation: string): never {
    return NcError.notImplemented(`SQL Server ${operation}`);
  }

  async testConnection(args: any = {}) {
    const func = this.testConnection.name;
    const result = new Result();
    log.api(`${func}:args:`, args);

    try {
      await this.sqlClient.raw('SELECT 1 + 1 AS data');
    } catch (e: any) {
      result.code = -1;
      result.message = e?.message || String(e);
      result.object = e;
    } finally {
      log.api(`${func}:result:`, result);
    }

    return result;
  }

  async version(args: any = {}) {
    const func = this.version.name;
    const result = new Result();
    log.api(`${func}:args:`, args);

    try {
      const rows = this.extractRows(
        await this.sqlClient.raw(
          "SELECT CONVERT(varchar(128), SERVERPROPERTY('ProductVersion')) AS version, " +
            "CONVERT(varchar(128), SERVERPROPERTY('ProductLevel')) AS level, " +
            "CONVERT(varchar(128), SERVERPROPERTY('Edition')) AS edition",
        ),
      );
      const details = rows[0];

      if (!details?.version) {
        result.code = -1;
        result.message = 'Unable to determine SQL Server version';
        return result;
      }

      const parts = String(details.version).split('.');
      result.data.object = {
        ...details,
        version: String(details.version),
        primary: parts[0],
        major: parts[1] || '0',
        minor: parts[2] || '0',
        key: `${parts[0] || ''}${parts[1] || ''}`,
      };
      this._version = result.data.object;
    } catch (e: any) {
      result.code = -1;
      result.message = e?.message || String(e);
    }

    return result;
  }

  getKnexDataTypes() {
    const result = new Result();
    result.data.list = [
      'bigint',
      'binary',
      'bit',
      'char',
      'date',
      'datetime',
      'datetime2',
      'datetimeoffset',
      'decimal',
      'float',
      'geography',
      'geometry',
      'hierarchyid',
      'image',
      'int',
      'money',
      'nchar',
      'ntext',
      'numeric',
      'nvarchar',
      'real',
      'smalldatetime',
      'smallint',
      'smallmoney',
      'sql_variant',
      'text',
      'time',
      'timestamp',
      'tinyint',
      'uniqueidentifier',
      'varbinary',
      'varchar',
      'xml',
      'rowversion',
      'vector',
    ];
    return result;
  }

  async databaseList(args: any = {}) {
    const func = this.databaseList.name;
    const result = new Result();
    log.api(`${func}:args:`, args);

    result.data.list = this.extractRows(
      await this.sqlClient.raw(
        'SELECT name AS database_name, database_id, create_date FROM sys.databases ORDER BY name',
      ),
    );
    return result;
  }

  async schemaList(args: any = {}) {
    const func = this.schemaList.name;
    const result = new Result();
    log.api(`${func}:args:`, args);

    result.data.list = this.extractRows(
      await this.sqlClient.raw(
        "SELECT name AS schema_name FROM sys.schemas " +
          "WHERE name NOT IN ('sys', 'INFORMATION_SCHEMA') ORDER BY name",
      ),
    );
    return result;
  }

  async tableList(args: any = {}) {
    const func = this.tableList.name;
    const result = new Result();
    const schema = this.getEffectiveSchema(args);
    log.api(`${func}:args:`, { ...args, schema });

    result.data.list = this.extractRows(
      await this.sqlClient.raw(
        `SELECT s.name AS ts, t.name AS tn, t.create_date, t.modify_date
         FROM sys.tables t
         INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
         WHERE s.name = ?
         ORDER BY s.name, t.name`,
        [schema],
      ),
    );
    return result;
  }

  async viewList(args: any = {}) {
    const func = this.viewList.name;
    const result = new Result();
    const schema = this.getEffectiveSchema(args);
    log.api(`${func}:args:`, { ...args, schema });

    const rows = this.extractRows(
      await this.sqlClient.raw(
        `SELECT TABLE_SCHEMA AS ts, TABLE_NAME AS view_name, VIEW_DEFINITION AS view_definition
         FROM INFORMATION_SCHEMA.VIEWS
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME`,
        [schema],
      ),
    );

    result.data.list = rows.map((row) => ({
      ...row,
      table_name: row.table_name || row.view_name,
      view_name: row.view_name || row.table_name,
    }));
    return result;
  }

  async columnList(args: any = {}) {
    const func = this.columnList.name;
    const result = new Result();
    const schema = this.getEffectiveSchema(args);
    const database = this.connectionConfig?.connection?.database;
    log.api(`${func}:args:`, { ...args, schema, database });

    const rows = this.extractRows(
      await this.sqlClient.raw(
        `SELECT
           c.TABLE_NAME AS tn,
           c.COLUMN_NAME AS cn,
           c.DATA_TYPE AS dt,
           c.CHARACTER_MAXIMUM_LENGTH AS clen,
           c.NUMERIC_PRECISION AS np,
           c.NUMERIC_SCALE AS ns,
           c.DATETIME_PRECISION AS dp,
           c.ORDINAL_POSITION AS cop,
           c.IS_NULLABLE AS is_nullable,
           c.COLUMN_DEFAULT AS cdf,
           c.CHARACTER_SET_NAME AS csn,
           CASE WHEN pk.COLUMN_NAME IS NULL THEN 0 ELSE 1 END AS is_pk,
           CASE WHEN uq.COLUMN_NAME IS NULL THEN 0 ELSE 1 END AS is_unique,
           CASE
             WHEN COLUMNPROPERTY(
               OBJECT_ID(QUOTENAME(c.TABLE_SCHEMA) + '.' + QUOTENAME(c.TABLE_NAME)),
               c.COLUMN_NAME,
               'IsIdentity'
             ) = 1 THEN 1 ELSE 0
           END AS is_identity
         FROM INFORMATION_SCHEMA.COLUMNS c
         LEFT JOIN (
           SELECT ku.TABLE_CATALOG, ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
           FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
           INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
             ON ku.CONSTRAINT_CATALOG = tc.CONSTRAINT_CATALOG
            AND ku.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
            AND ku.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
           WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
         ) pk
           ON pk.TABLE_CATALOG = c.TABLE_CATALOG
          AND pk.TABLE_SCHEMA = c.TABLE_SCHEMA
          AND pk.TABLE_NAME = c.TABLE_NAME
          AND pk.COLUMN_NAME = c.COLUMN_NAME
         LEFT JOIN (
           SELECT DISTINCT ku.TABLE_CATALOG, ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
           FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
           INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
             ON ku.CONSTRAINT_CATALOG = tc.CONSTRAINT_CATALOG
            AND ku.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
            AND ku.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
           WHERE tc.CONSTRAINT_TYPE = 'UNIQUE'
         ) uq
           ON uq.TABLE_CATALOG = c.TABLE_CATALOG
          AND uq.TABLE_SCHEMA = c.TABLE_SCHEMA
          AND uq.TABLE_NAME = c.TABLE_NAME
          AND uq.COLUMN_NAME = c.COLUMN_NAME
         WHERE c.TABLE_CATALOG = ?
           AND c.TABLE_SCHEMA = ?
           AND c.TABLE_NAME = ?
         ORDER BY c.ORDINAL_POSITION`,
        [database, schema, args.tn],
      ),
    );

    result.data.list = rows.map((row) => {
      const unbounded = row.clen === -1;
      const clen = unbounded ? null : row.clen;
      const dt = String(row.dt || '').toLowerCase();
      const typeLength =
        dt === 'varchar' ||
        dt === 'nvarchar' ||
        dt === 'char' ||
        dt === 'nchar' ||
        dt === 'binary' ||
        dt === 'varbinary'
          ? unbounded
            ? 'MAX'
            : row.clen
          : row.np ?? row.dp ?? '';

      return {
        ...row,
        tn: row.tn,
        cn: row.cn,
        cno: row.cn,
        dt,
        ct:
          typeLength !== '' && typeLength !== null && typeLength !== undefined
            ? `${dt}(${typeLength})`
            : dt,
        clen,
        dtx: 'specificType',
        dtxp: typeLength ?? '',
        dtxs: row.ns ?? '',
        pk: Boolean(row.is_pk),
        ck: row.is_pk ? 'PRIMARY KEY' : '',
        unique: Boolean(row.is_unique),
        ai: Boolean(row.is_identity),
        nrqd: row.is_nullable === 'YES',
        rqd: row.is_nullable !== 'YES',
        un: false,
        au: false,
      };
    });

    return result;
  }

  async relationListAll(args: any = {}) {
    return this.relationListInternal(args);
  }

  async relationList(args: any = {}) {
    return this.relationListInternal(args, args.tn);
  }

  private async relationListInternal(args: any = {}, tableName?: string) {
    const result = new Result();
    const schema = this.getEffectiveSchema(args);
    const bindings: any[] = [schema, schema];
    let tableFilter = '';

    if (tableName) {
      tableFilter = ' AND fk_tab.name = ?';
      bindings.push(tableName);
    }

    const rows = this.extractRows(
      await this.sqlClient.raw(
        `SELECT
           fk.name AS cstn,
           fk_tab.name AS tn,
           fk_col.name AS cn,
           pk_tab.name AS rtn,
           pk_col.name AS rcn,
           fk.update_referential_action_desc AS ur,
           fk.delete_referential_action_desc AS dr,
           fk_cols.constraint_column_id AS no
         FROM sys.foreign_keys fk
         INNER JOIN sys.tables fk_tab ON fk_tab.object_id = fk.parent_object_id
         INNER JOIN sys.schemas fk_schema ON fk_schema.schema_id = fk_tab.schema_id
         INNER JOIN sys.tables pk_tab ON pk_tab.object_id = fk.referenced_object_id
         INNER JOIN sys.schemas pk_schema ON pk_schema.schema_id = pk_tab.schema_id
         INNER JOIN sys.foreign_key_columns fk_cols
           ON fk_cols.constraint_object_id = fk.object_id
         INNER JOIN sys.columns fk_col
           ON fk_col.object_id = fk_tab.object_id
          AND fk_col.column_id = fk_cols.parent_column_id
         INNER JOIN sys.columns pk_col
           ON pk_col.object_id = pk_tab.object_id
          AND pk_col.column_id = fk_cols.referenced_column_id
         WHERE fk_schema.name = ?
           AND pk_schema.name = ?${tableFilter}
         ORDER BY fk_tab.name, fk.name, fk_cols.constraint_column_id`,
        bindings,
      ),
    );

    result.data.list = rows.map((row) => ({
      ...row,
      ur: String(row.ur || '').replaceAll('_', ' '),
      dr: String(row.dr || '').replaceAll('_', ' '),
    }));
    return result;
  }

  async indexList(args: any = {}) {
    const result = new Result();
    const schema = this.getEffectiveSchema(args);

    result.data.list = this.extractRows(
      await this.sqlClient.raw(
        `SELECT
           t.name AS table_view,
           i.name AS key_name,
           c.name AS cn,
           ic.key_ordinal AS seq_in_index,
           CASE WHEN i.is_unique = 1 THEN 0 ELSE 1 END AS non_unique,
           CASE WHEN i.is_primary_key = 1 THEN 1 ELSE 0 END AS pk,
           i.type_desc AS index_type
         FROM sys.indexes i
         INNER JOIN sys.tables t ON t.object_id = i.object_id
         INNER JOIN sys.schemas s ON s.schema_id = t.schema_id
         INNER JOIN sys.index_columns ic
           ON ic.object_id = i.object_id AND ic.index_id = i.index_id
         INNER JOIN sys.columns c
           ON c.object_id = ic.object_id AND c.column_id = ic.column_id
         WHERE s.name = ?
           AND t.name = ?
           AND i.index_id > 0
           AND i.is_hypothetical = 0
         ORDER BY i.index_id, ic.key_ordinal`,
        [schema, args.tn],
      ),
    );
    return result;
  }

  async hasTable(args: any = {}) {
    const result = new Result();
    result.data.value = await this.sqlClient.schema
      .withSchema(this.getEffectiveSchema(args))
      .hasTable(args.tn);
    return result;
  }

  async hasDatabase(args: any = {}) {
    const result = new Result();
    const databaseName = args.databaseName || args.database;
    result.data.value =
      this.extractRows(
        await this.sqlClient.raw(
          'SELECT name FROM sys.databases WHERE name = ?',
          [databaseName],
        ),
      ).length > 0;
    return result;
  }

  async createTableIfNotExists(args: any = {}) {
    const result = new Result();
    const schema = this.getEffectiveSchema(args);
    const exists = await this.sqlClient.schema.withSchema(schema).hasTable(args.tn);

    if (!exists) {
      await this.sqlClient.schema.withSchema(schema).createTable(args.tn, (table) => {
        table.increments();
        table.string('title').notNullable();
        table.string('titleDown').nullable();
        table.string('description').nullable();
        table.integer('batch').nullable();
        table.string('checksum').nullable();
        table.integer('status').nullable();
        table.dateTime('created');
        table.timestamps();
      });
    }

    return result;
  }

  async sequenceList(args: any = {}) {
    const result = new Result();
    const schema = this.getEffectiveSchema(args);
    result.data.list = this.extractRows(
      await this.sqlClient.raw(
        `SELECT seq.name AS sequence_name, seq.start_value, seq.increment,
                seq.minimum_value AS min_value, seq.maximum_value AS max_value
         FROM sys.sequences seq
         INNER JOIN sys.schemas s ON s.schema_id = seq.schema_id
         WHERE s.name = ?
         ORDER BY seq.name`,
        [schema],
      ),
    );
    return result;
  }

  async schemaCreateWithCredentials(_args: any = {}) {
    return this.unsupported('schema creation with credentials');
  }

  async sequenceCreate(_args: any = {}) {
    return this.unsupported('sequence creation');
  }

  async sequenceUpdate(_args: any = {}) {
    return this.unsupported('sequence update');
  }

  async sequenceDelete(_args: any = {}) {
    return this.unsupported('sequence deletion');
  }

  async createDatabaseIfNotExists(_args: any = {}) {
    return this.unsupported('database creation');
  }

  async tableCreate(_args: any = {}) {
    return this.unsupported('table creation');
  }

  async tableUpdate(_args: any = {}) {
    return this.unsupported('table alteration');
  }

  async tableDelete(args: any = {}) {
    const result = new Result();
    await this.sqlClient.schema
      .withSchema(this.getEffectiveSchema(args))
      .dropTable(args.tn);
    return result;
  }

  async tableCreateStatement(_args: any = {}) {
    return this.unsupported('table create statement generation');
  }

  async tableInsertStatement(_args: any = {}) {
    return this.unsupported('table insert statement generation');
  }

  async tableUpdateStatement(_args: any = {}) {
    return this.unsupported('table update statement generation');
  }

  async tableDeleteStatement(_args: any = {}) {
    return this.unsupported('table delete statement generation');
  }

  async tableTruncateStatement(_args: any = {}) {
    return this.unsupported('table truncate statement generation');
  }

  async tableSelectStatement(_args: any = {}) {
    return this.unsupported('table select statement generation');
  }
}

export default MssqlClient;
