(ns metabase.native-query-snippets.core
  (:require
   [metabase.native-query-snippets.api]
   [metabase.native-query-snippets.models.native-query-snippet]
   [metabase.native-query-snippets.models.native-query-snippet.permissions]
   [potemkin :as p]))

(comment
  metabase.native-query-snippets.api/keep-me
  metabase.native-query-snippets.models.native-query-snippet.permissions/keep-me
  metabase.native-query-snippets.models.native-query-snippet/keep-me)

(p/import-vars
 [metabase.native-query-snippets.api
  list-native-query-snippets
  get-native-query-snippet]
 [metabase.native-query-snippets.models.native-query-snippet
  add-template-tags
  NativeQuerySnippetName]
 [metabase.native-query-snippets.models.native-query-snippet.permissions
  has-any-native-permissions?])
