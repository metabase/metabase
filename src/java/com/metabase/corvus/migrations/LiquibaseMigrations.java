package com.metabase.corvus.migrations;

import java.sql.SQLException;
import liquibase.Liquibase;
import liquibase.database.DatabaseFactory;
import liquibase.database.Database;
import liquibase.database.jvm.JdbcConnection;
import liquibase.exception.DatabaseException;
import liquibase.resource.ClassLoaderResourceAccessor;


public class LiquibaseMigrations {

  private static final String LIQUIBASE_CHANGELOG = "migrations/liquibase.json";


  public static final void setupDatabase(java.sql.Connection dbConnection) throws Exception {
    try {
      Database database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(dbConnection));
      Liquibase liquibase = new Liquibase(LIQUIBASE_CHANGELOG, new ClassLoaderResourceAccessor(), database);
      liquibase.update("");
    } catch (Exception e) {
      throw new DatabaseException(e);
    } finally {
      if (dbConnection != null) {
        try {
          dbConnection.rollback();
          dbConnection.close();
        } catch (SQLException e){
          //nothing to do
        }
      }
    }
  }

  public static final void teardownDatabase(java.sql.Connection dbConnection) throws Exception {
    try {
      Database database = DatabaseFactory.getInstance().findCorrectDatabaseImplementation(new JdbcConnection(dbConnection));
      Liquibase liquibase = new Liquibase(LIQUIBASE_CHANGELOG, new ClassLoaderResourceAccessor(), database);
      liquibase.rollback(10000, "");
    } catch (Exception e) {
      throw new DatabaseException(e);
    } finally {
      if (dbConnection != null) {
        try {
          dbConnection.rollback();
          dbConnection.close();
        } catch (SQLException e){
          //nothing to do
        }
      }
    }
  }

}
