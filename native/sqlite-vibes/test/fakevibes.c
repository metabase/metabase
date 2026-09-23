/*
** A deterministic stand-in for vibes() for the RERANK tests.
**
**   vibes(prompt, id, roster)  -> roster[id].score, or NULL when there is none
**   vibes_calls()              -> number of vibes() calls so far
**   vibes_rosters()            -> number of distinct (prompt, roster) pairs seen
**   vibes_last()               -> the last "prompt|roster" seen
*/
#include "sqlite3ext.h"
SQLITE_EXTENSION_INIT1
#include <string.h>
#include <stdio.h>

static sqlite3_int64 nCalls = 0;
static sqlite3_int64 nRosters = 0;
static char *zLast = 0;

static void vibesFunc(sqlite3_context *ctx, int argc, sqlite3_value **argv){
  sqlite3 *db = sqlite3_context_db_handle(ctx);
  sqlite3_stmt *pStmt = 0;
  const char *zPrompt = (const char*)sqlite3_value_text(argv[0]);
  const char *zRoster = (const char*)sqlite3_value_text(argv[2]);
  char *zKey;
  nCalls++;
  if( zRoster==0 ) return;
  zKey = sqlite3_mprintf("%s|%s", zPrompt ? zPrompt : "<null>", zRoster);
  if( zLast==0 || strcmp(zLast, zKey)!=0 ){
    nRosters++;
    sqlite3_free(zLast);
    zLast = zKey;
  }else{
    sqlite3_free(zKey);
  }
  if( sqlite3_prepare_v2(db,
        "SELECT json_extract(?1, '$.\"' || ?2 || '\".score')", -1, &pStmt, 0)
      !=SQLITE_OK ){
    sqlite3_result_error(ctx, sqlite3_errmsg(db), -1);
    return;
  }
  sqlite3_bind_value(pStmt, 1, argv[2]);
  sqlite3_bind_value(pStmt, 2, argv[1]);
  if( sqlite3_step(pStmt)==SQLITE_ROW ){
    sqlite3_result_value(ctx, sqlite3_column_value(pStmt, 0));
  }
  sqlite3_finalize(pStmt);
}
static void callsFunc(sqlite3_context *ctx, int argc, sqlite3_value **argv){
  sqlite3_result_int64(ctx, nCalls);
}
static void rostersFunc(sqlite3_context *ctx, int argc, sqlite3_value **argv){
  sqlite3_result_int64(ctx, nRosters);
}
static void lastFunc(sqlite3_context *ctx, int argc, sqlite3_value **argv){
  if( zLast ) sqlite3_result_text(ctx, zLast, -1, SQLITE_TRANSIENT);
}
static void resetFunc(sqlite3_context *ctx, int argc, sqlite3_value **argv){
  nCalls = 0; nRosters = 0; sqlite3_free(zLast); zLast = 0;
}

#ifdef _WIN32
__declspec(dllexport)
#endif
int sqlite3_fakevibes_init(sqlite3 *db, char **pzErrMsg,
                           const sqlite3_api_routines *pApi){
  SQLITE_EXTENSION_INIT2(pApi);
  sqlite3_create_function(db, "vibes", 3, SQLITE_UTF8, 0, vibesFunc, 0, 0);
  sqlite3_create_function(db, "vibes_calls", 0, SQLITE_UTF8, 0, callsFunc, 0, 0);
  sqlite3_create_function(db, "vibes_rosters", 0, SQLITE_UTF8, 0, rostersFunc, 0, 0);
  sqlite3_create_function(db, "vibes_last", 0, SQLITE_UTF8, 0, lastFunc, 0, 0);
  sqlite3_create_function(db, "vibes_reset", 0, SQLITE_UTF8, 0, resetFunc, 0, 0);
  return SQLITE_OK;
}
