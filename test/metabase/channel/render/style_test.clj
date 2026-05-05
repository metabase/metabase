(ns metabase.channel.render.style-test
  (:require
   [clojure.test :refer :all]
   [metabase.channel.render.style :as style]
   [metabase.test :as mt]))

(deftest ^:parallel filter-out-nil-test
  (testing "`style` should filter out nil values"
    (is (= ""
           (style/style {:a nil})))
    (is (= "a: 0; c: 2;"
           (style/style {:a 0, :b nil, :c 2, :d ""})))))

(deftest ^:parallel style-sanitizes-css-values-test
  (testing "values with characters that can escape CSS context are sanitized"
    (are [res input] (= res (style/style input))
      "k: abc;"           {:k "a;b:c"}              ; semicolons do not introduce new declarations
      "k: a/style;"       {:k "a}</style>"}         ; braces/angles do break out of CSS into HTML
      "k: 3c script3e;"   {:k "\\3c script\\3e"}    ; disallow escape sequences
      "k: blocked(1);"    {:k "url(1)"}             ; no url() injections
      "k: url/ hack/(1);" {:k "url/* hack/*(1)"}))  ; no comment hacks
  (testing "legitimate CSS values are unchanged"
    (are [res input] (= res (style/style input))
      "text-align: left;"                {:text-align "left"}
      "max-width: 100% !important;"      {:max-width "100% !important"}
      "border: .5em solid #DEAD00;"      {:border ".5em solid #DEAD00"}
      "font-family: One, \"Two Three\";" {:font-family "One, \"Two Three\""}
      "aspect-ratio: 4/5 auto;"          {:aspect-ratio "4/5 auto"}
      "color: rgba(1,1,1,1);"            {:color "rgba(1,1,1,1)"}
      ;; <skip lint>
      "content: 'шо ти';"                {:content "'шо ти'"})))

(deftest register-fonts-test
  (testing "Under normal circumstances, font registration should work as expected"
    (is (= nil
           (#'style/register-fonts-if-needed!))))
  (testing "If font registration fails, we should an Exception with a useful error message"
    (with-redefs [style/register-font! (fn [& _]
                                         (throw (ex-info "Oops!" {})))]
      (mt/with-log-messages-for-level [messages :error]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Error registering fonts: Metabase will not be able to send Pulses"
             (#'style/register-fonts!)))
        (testing "Should log the Exception"
          (is (=? {:level :error, :e Throwable, :message #"^Error registering fonts: .*"}
                  (first (messages)))))))))
