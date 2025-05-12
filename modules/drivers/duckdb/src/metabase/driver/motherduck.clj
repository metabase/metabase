(ns metabase.driver.motherduck
  (:require
   [metabase.driver :as driver]))

(driver/register! :motherduck, :parent :duckdb)