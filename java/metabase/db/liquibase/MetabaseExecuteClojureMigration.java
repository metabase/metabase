package liquibase.change.custom;

import liquibase.database.Database;
import liquibase.exception.CustomChangeException;
import liquibase.exception.RollbackImpossibleException;
import liquibase.exception.SetupException;
import liquibase.exception.ValidationErrors;
import liquibase.resource.ResourceAccessor;
import clojure.lang.RT;
import clojure.lang.Var;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

public class MetabaseExecuteClojureMigration implements CustomTaskChange, CustomTaskRollback {

    private String migrationName;

    @SuppressWarnings({"UnusedDeclaration", "FieldCanBeLocal"})
    private ResourceAccessor resourceAccessor;


    public String getMigrationName() {
        return migrationName;
    }

    public void setMigrationName(String migrationName) {
        this.migrationName = migrationName;
    }

    @Override
    public void execute(Database database) throws CustomChangeException {
        try {
            RT.loadResourceScript("migrations/001_clojure_migration.clj");
            Var execute = RT.var("migrations.001-clojure-migration", getMigrationName()+"-execute");
            // invoke and print out the result
            Object result = execute.invoke(database);
        } catch (Exception e) {
            throw new CustomChangeException("Error executing Clojure migration"+getMigrationName(), e);
        }
    }

    @Override
    public void rollback(Database database) throws CustomChangeException, RollbackImpossibleException {
        try {
            RT.loadResourceScript("migrations/001_clojure_migration.clj");
            Var rollback  = RT.var("migrations.001-clojure-migration", getMigrationName()+"-rollback");
            // if exists execute
            if (rollback.isBound()) {
                Object result = rollback.invoke(database);
            } else {
                System.out.println("Rollback not found for migration: "+getMigrationName());
            }
        } catch (Exception e) {
            throw new CustomChangeException("Error rollback Clojure migration"+getMigrationName(), e);
        }

    }

    @Override
    public String getConfirmationMessage() {
        return null;
    }

    @Override
    public void setUp() throws SetupException {
        try {
            RT.loadResourceScript("migrations/001_clojure_migration.clj");
            Var execute = RT.var("migrations.001-clojure-migration", getMigrationName()+"-execute");
            if (!execute.isBound()) {
                throw new SetupException("Error loading Clojure migration"+getMigrationName());
            }
        } catch (Exception e) {
            throw new SetupException("Error loading Clojure migration"+getMigrationName(), e);
        }
    }

    @Override
    public void setFileOpener(ResourceAccessor resourceAccessor) {
        this.resourceAccessor = resourceAccessor;
    }

    @Override
    public ValidationErrors validate(Database database) {
        //validate if the file exists
        return null;
    }
}
