(ns metabase.util.infer-spaces-test
  (:require [expectations :refer :all]
            [metabase.util.infer-spaces :refer :all]))

(expect ["user"] (infer-spaces "user"))
(expect ["users"] (infer-spaces "users"))
(expect ["orders"] (infer-spaces "orders"))
(expect ["products"] (infer-spaces "products"))
(expect ["events"] (infer-spaces "events"))

(expect ["checkins"] (infer-spaces "checkins"))

(expect ["dashboard" "card" "subscription"] (infer-spaces "dashboardcardsubscription"))
