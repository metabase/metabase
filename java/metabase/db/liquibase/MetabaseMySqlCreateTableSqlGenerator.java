package metabase.db.liquibase;

import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;

import liquibase.database.Database;
import liquibase.database.core.MySQLDatabase;
import liquibase.exception.ValidationErrors;
import liquibase.sql.Sql;
import liquibase.sql.UnparsedSql;
import liquibase.sqlgenerator.SqlGeneratorChain;
import liquibase.sqlgenerator.core.AbstractSqlGenerator;
import liquibase.sqlgenerator.core.CreateTableGenerator;
import liquibase.statement.core.CreateTableStatement;
import liquibase.structure.DatabaseObject;

// This class is a simple wrapper around a CreateTableGenerator that appends ENGINE InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci to the generated SQL
public class MetabaseMySqlCreateTableSqlGenerator extends AbstractSqlGenerator<CreateTableStatement> {
    private CreateTableGenerator parentGenerator;

    public MetabaseMySqlCreateTableSqlGenerator() {
        this.parentGenerator = new CreateTableGenerator();
    }

    @Override
    public boolean supports(CreateTableStatement statement, Database database) {
        return parentGenerator.supports(statement, database) && (database instanceof MySQLDatabase);
    }

    @Override
    public int getPriority() {
        return parentGenerator.getPriority() + 1;
    }

    @Override
    public Sql[] generateSql(CreateTableStatement statement, Database database, SqlGeneratorChain sqlGeneratorChain) {
        // it seems like Liquibase actually ignores the `defaultValueComputed`
        // that we set in the migrations YAML file -- see
        // https://stackoverflow.com/questions/58816496/force-liquibase-to-current-timestamp-instead-of-now
        database.setCurrentDateTimeFunction("current_timestamp(6)");

        Sql[] sqls = this.parentGenerator.generateSql(statement, database, sqlGeneratorChain);
        for (int i = 0; i < sqls.length; i++) {
            Sql sql = sqls[i];
            if (!sql.toSql().startsWith("CREATE TABLE")) continue;

            Collection<? extends DatabaseObject> affectedObjects = sql.getAffectedDatabaseObjects();

            sqls[i] = new UnparsedSql(sql.toSql() + " ENGINE InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci",
                                      sql.getEndDelimiter(),
                                      affectedObjects.toArray(new DatabaseObject[affectedObjects.size()]));
        }
        return sqls;
    }

    @Override
    public ValidationErrors validate(CreateTableStatement statement, Database database, SqlGeneratorChain sqlGeneratorChain) {
        return this.parentGenerator.validate(statement, database, sqlGeneratorChain);
    }
}
