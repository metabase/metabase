(ns metabase.util.currency
  "The list of currencies, and associated metadata, used by Metabase for number formatting."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::currency-info
  [:map
   [:symbol :string]
   [:name :string]
   [:symbol_native :string]
   [:decimal_digits :int]
   [:rounding number?]
   [:code :string]
   [:name_plural :string]])

(mu/defn supports-symbol? :- :boolean
  "Currencies for which the Metabase frontend supports formatting with its symbol, rather than just
  its code or name. This list is referenced during XLSX export to achieve parity in currency formatting."
  [currency-code :- [:or :string :keyword]]
  (contains?
   #{:USD  ;; US dollar
     :CAD  ;; Canadian dollar
     :EUR  ;; Euro
     :AUD  ;; Australian dollar
     :BRL  ;; Brazilian real
     :BTC  ;; Bitcoin
     :CNY  ;; Chinese yuan
     :GBP  ;; British pound
     :HKD  ;; Hong Kong dollar
     :ILS  ;; Israeli new shekel
     :INR  ;; Indian rupee
     :JPY  ;; Japanese yen
     :KRW  ;; South Korean won
     :MXN  ;; Mexican peso
     :NZD  ;; New Zealand dollar
     :TWD  ;; New Taiwan dollar
     :VND} ;; Vietnamese dong
   (keyword currency-code)))

(defn- make-currency [symbol name symbol_native decimal_digits rounding code name_plural]
  {:symbol         symbol
   :name           name,
   :symbol_native  symbol_native
   :decimal_digits decimal_digits
   :rounding       rounding
   :code           code
   :name_plural    name_plural})

(def ^:private currency-list
  (concat
   [[:USD (make-currency "$" "US Dollar" "$" 2 0 "USD" "US dollars")]
    [:CAD (make-currency "CA$" "Canadian Dollar" "$" 2 0 "CAD" "Canadian dollars")]
    [:EUR (make-currency "€" "Euro" "€" 2 0 "EUR" "euros")]]
   (sort-by
    #(-> % second :name)
    [[:AED (make-currency "AED" "United Arab Emirates Dirham" "د.إ.‏" 2 0 "AED" "UAE dirhams")]
     [:AFN (make-currency "Af" "Afghan Afghani" "؋" 0 0 "AFN" "Afghan Afghanis")]
     [:ALL (make-currency "ALL" "Albanian Lek" "Lek" 0 0 "ALL" "Albanian lekë")]
     [:AMD (make-currency "AMD" "Armenian Dram" "դր." 0 0 "AMD" "Armenian drams")]
     [:ARS (make-currency "AR$" "Argentine Peso" "$" 2 0 "ARS" "Argentine pesos")]
     [:AUD (make-currency "AU$" "Australian Dollar" "$" 2 0 "AUD" "Australian dollars")]
     [:AZN (make-currency "₼" "Azerbaijani Manat" "₼" 2 0 "AZN" "Azerbaijani manats")]
     [:BAM (make-currency "KM" "Bosnia-Herzegovina Convertible Mark" "KM" 2 0 "BAM" "Bosnia-Herzegovina convertible marks")]
     [:BDT (make-currency "Tk" "Bangladeshi Taka" "৳" 2 0 "BDT" "Bangladeshi takas")]
     [:BGN (make-currency "BGN" "Bulgarian Lev" "лв." 2 0 "BGN" "Bulgarian leva")]
     [:BHD (make-currency "BD" "Bahraini Dinar" "د.ب.‏" 3 0 "BHD" "Bahraini dinars")]
     [:BIF (make-currency "FBu" "Burundian Franc" "FBu" 0 0 "BIF" "Burundian francs")]
     [:BND (make-currency "BN$" "Brunei Dollar" "$" 2 0 "BND" "Brunei dollars")]
     [:BOB (make-currency "Bs" "Bolivian Boliviano" "Bs" 2 0 "BOB" "Bolivian bolivianos")]
     [:BRL (make-currency "R$" "Brazilian Real" "R$" 2 0 "BRL" "Brazilian reals")]
     [:BTC (make-currency "₿" "Bitcoin" "BTC" 8 0 "BTC" "Bitcoins")]
     [:BWP (make-currency "BWP" "Botswanan Pula" "P" 2 0 "BWP" "Botswanan pulas")]
     [:BYR (make-currency "BYR" "Belarusian Ruble" "BYR" 0 0 "BYR" "Belarusian rubles")]
     [:BZD (make-currency "BZ$" "Belize Dollar" "$" 2 0 "BZD" "Belize dollars")]
     [:CDF (make-currency "CDF" "Congolese Franc" "FrCD" 2 0 "CDF" "Congolese francs")]
     [:CHF (make-currency "CHF" "Swiss Franc" "CHF" 2 0.05 "CHF" "Swiss francs")]
     [:CLP (make-currency "CL$" "Chilean Peso" "$" 0 0 "CLP" "Chilean pesos")]
     [:CNY (make-currency "CN¥" "Chinese Yuan" "CN¥" 2 0 "CNY" "Chinese yuan")]
     [:COP (make-currency "CO$" "Colombian Peso" "$" 0 0 "COP" "Colombian pesos")]
     [:CRC (make-currency "₡" "Costa Rican Colón" "₡" 0 0 "CRC" "Costa Rican colóns")]
     [:CVE (make-currency "CV$" "Cape Verdean Escudo" "CV$" 2 0 "CVE" "Cape Verdean escudos")]
     [:CZK (make-currency "Kč" "Czech Republic Koruna" "Kč" 2 0 "CZK" "Czech Republic korunas")]
     [:DJF (make-currency "Fdj" "Djiboutian Franc" "Fdj" 0 0 "DJF" "Djiboutian francs")]
     [:DKK (make-currency "Dkr" "Danish Krone" "kr" 2 0 "DKK" "Danish kroner")]
     [:DOP (make-currency "RD$" "Dominican Peso" "RD$" 2 0 "DOP" "Dominican pesos")]
     [:DZD (make-currency "DA" "Algerian Dinar" "د.ج.‏" 2 0 "DZD" "Algerian dinars")]
     [:EGP (make-currency "EGP" "Egyptian Pound" "ج.م.‏" 2 0 "EGP" "Egyptian pounds")]
     [:ERN (make-currency "Nfk" "Eritrean Nakfa" "Nfk" 2 0 "ERN" "Eritrean nakfas")]
     [:ETB (make-currency "Br" "Ethiopian Birr" "Br" 2 0 "ETB" "Ethiopian birrs")]
     [:ETH (make-currency "ETH" "Ethereum" "ETH" 8 0 "ETH" "Ethereum")]
     [:GBP (make-currency "£" "British Pound Sterling" "£" 2 0 "GBP" "British pounds sterling")]
     [:GEL (make-currency "GEL" "Georgian Lari" "GEL" 2 0 "GEL" "Georgian laris")]
     [:GHS (make-currency "GH₵" "Ghanaian Cedi" "GH₵" 2 0 "GHS" "Ghanaian cedis")]
     [:GNF (make-currency "FG" "Guinean Franc" "FG" 0 0 "GNF" "Guinean francs")]
     [:GTQ (make-currency "GTQ" "Guatemalan Quetzal" "Q" 2 0 "GTQ" "Guatemalan quetzals")]
     [:HKD (make-currency "HK$" "Hong Kong Dollar" "$" 2 0 "HKD" "Hong Kong dollars")]
     [:HNL (make-currency "HNL" "Honduran Lempira" "L" 2 0 "HNL" "Honduran lempiras")]
     [:HRK (make-currency "kn" "Croatian Kuna" "kn" 2 0 "HRK" "Croatian kunas")]
     [:HUF (make-currency "Ft" "Hungarian Forint" "Ft" 0 0 "HUF" "Hungarian forints")]
     [:IDR (make-currency "Rp" "Indonesian Rupiah" "Rp" 0 0 "IDR" "Indonesian rupiahs")]
     [:ILS (make-currency "₪" "Israeli New Shekel" "₪" 2 0 "ILS" "Israeli new shekels")]
     [:INR (make-currency "Rs" "Indian Rupee" "টকা" 2 0 "INR" "Indian rupees")]
     [:IQD (make-currency "IQD" "Iraqi Dinar" "د.ع.‏" 0 0 "IQD" "Iraqi dinars")]
     [:IRR (make-currency "IRR" "Iranian Rial" "﷼" 0 0 "IRR" "Iranian rials")]
     [:ISK (make-currency "Ikr" "Icelandic Króna" "kr" 0 0 "ISK" "Icelandic krónur")]
     [:JMD (make-currency "J$" "Jamaican Dollar" "$" 2 0 "JMD" "Jamaican dollars")]
     [:JOD (make-currency "JD" "Jordanian Dinar" "د.أ.‏" 3 0 "JOD" "Jordanian dinars")]
     [:JPY (make-currency "¥" "Japanese Yen" "￥" 0 0 "JPY" "Japanese yen")]
     [:KES (make-currency "Ksh" "Kenyan Shilling" "Ksh" 2 0 "KES" "Kenyan shillings")]
     [:KGS (make-currency "KGS" "Kyrgyz Som" "сом" 2 0 "KGS" "Kyrgyz soms")]
     [:KHR (make-currency "KHR" "Cambodian Riel" "៛" 2 0 "KHR" "Cambodian riels")]
     [:KMF (make-currency "CF" "Comorian Franc" "FC" 0 0 "KMF" "Comorian francs")]
     [:KRW (make-currency "₩" "South Korean Won" "₩" 0 0 "KRW" "South Korean won")]
     [:KWD (make-currency "KD" "Kuwaiti Dinar" "د.ك.‏" 3 0 "KWD" "Kuwaiti dinars")]
     [:KZT (make-currency "KZT" "Kazakhstani Tenge" "тңг." 2 0 "KZT" "Kazakhstani tenges")]
     [:LBP (make-currency "LB£" "Lebanese Pound" "ل.ل.‏" 0 0 "LBP" "Lebanese pounds")]
     [:LKR (make-currency "SLRs" "Sri Lankan Rupee" "SL Re" 2 0 "LKR" "Sri Lankan rupees")]
     [:LTL (make-currency "Lt" "Lithuanian Litas" "Lt" 2 0 "LTL" "Lithuanian litai")]
     [:LVL (make-currency "Ls" "Latvian Lats" "Ls" 2 0 "LVL" "Latvian lati")]
     [:LYD (make-currency "LD" "Libyan Dinar" "د.ل.‏" 3 0 "LYD" "Libyan dinars")]
     [:MAD (make-currency "MAD" "Moroccan Dirham" "د.م.‏" 2 0 "MAD" "Moroccan dirhams")]
     [:MDL (make-currency "MDL" "Moldovan Leu" "MDL" 2 0 "MDL" "Moldovan lei")]
     [:MGA (make-currency "MGA" "Malagasy Ariary" "MGA" 0 0 "MGA" "Malagasy Ariaries")]
     [:MKD (make-currency "MKD" "Macedonian Denar" "MKD" 2 0 "MKD" "Macedonian denari")]
     [:MMK (make-currency "MMK" "Myanma Kyat" "K" 0 0 "MMK" "Myanma kyats")]
     [:MOP (make-currency "MOP$" "Macanese Pataca" "MOP$" 2 0 "MOP" "Macanese patacas")]
     [:MRU (make-currency "MRU" "Mauritania Ouguiya" "MRU" 2 0 "MRU" "Mauritania Ouguiyas")]
     [:MUR (make-currency "MURs" "Mauritian Rupee" "MURs" 0 0 "MUR" "Mauritian rupees")]
     [:MXN (make-currency "MX$" "Mexican Peso" "$" 2 0 "MXN" "Mexican pesos")]
     [:MYR (make-currency "RM" "Malaysian Ringgit" "RM" 2 0 "MYR" "Malaysian ringgits")]
     [:MZN (make-currency "MTn" "Mozambican Metical" "MTn" 2 0 "MZN" "Mozambican meticals")]
     [:NAD (make-currency "N$" "Namibian Dollar" "N$" 2 0 "NAD" "Namibian dollars")]
     [:NGN (make-currency "₦" "Nigerian Naira" "₦" 2 0 "NGN" "Nigerian nairas")]
     [:NIO (make-currency "C$" "Nicaraguan Córdoba" "C$" 2 0 "NIO" "Nicaraguan córdobas")]
     [:NOK (make-currency "Nkr" "Norwegian Krone" "kr" 2 0 "NOK" "Norwegian kroner")]
     [:NPR (make-currency "NPRs" "Nepalese Rupee" "नेरू" 2 0 "NPR" "Nepalese rupees")]
     [:NZD (make-currency "NZ$" "New Zealand Dollar" "$" 2 0 "NZD" "New Zealand dollars")]
     [:OMR (make-currency "OMR" "Omani Rial" "ر.ع.‏" 3 0 "OMR" "Omani rials")]
     [:PAB (make-currency "B/." "Panamanian Balboa" "B/." 2 0 "PAB" "Panamanian balboas")]
     [:PEN (make-currency "S/." "Peruvian Nuevo Sol" "S/." 2 0 "PEN" "Peruvian nuevos soles")]
     [:PGK (make-currency "K" "Papua New Guinean Kina" "K" 2 0 "PGK" "Papua New Guinean kina")]
     [:PHP (make-currency "₱" "Philippine Peso" "₱" 2 0 "PHP" "Philippine pesos")]
     [:PKR (make-currency "PKRs" "Pakistani Rupee" "₨" 0 0 "PKR" "Pakistani rupees")]
     [:PLN (make-currency "zł" "Polish Zloty" "zł" 2 0 "PLN" "Polish zlotys")]
     [:PYG (make-currency "₲" "Paraguayan Guarani" "₲" 0 0 "PYG" "Paraguayan guaranis")]
     [:QAR (make-currency "QR" "Qatari Rial" "ر.ق.‏" 2 0 "QAR" "Qatari rials")]
     [:RON (make-currency "RON" "Romanian Leu" "RON" 2 0 "RON" "Romanian lei")]
     [:RSD (make-currency "din." "Serbian Dinar" "дин." 0 0 "RSD" "Serbian dinars")]
     [:RUB (make-currency "₽" "Russian Ruble" "₽" 2 0 "RUB" "Russian rubles")]
     [:RWF (make-currency "RWF" "Rwandan Franc" "FR" 0 0 "RWF" "Rwandan francs")]
     [:SAR (make-currency "SR" "Saudi Riyal" "ر.س.‏" 2 0 "SAR" "Saudi riyals")]
     [:SDG (make-currency "SDG" "Sudanese Pound" "SDG" 2 0 "SDG" "Sudanese pounds")]
     [:SEK (make-currency "kr" "Swedish Krona" "kr" 2 0 "SEK" "Swedish kronor")]
     [:SGD (make-currency "S$" "Singapore Dollar" "$" 2 0 "SGD" "Singapore dollars")]
     [:SOS (make-currency "Ssh" "Somali Shilling" "Sh.So" 0 0 "SOS" "Somali shillings")]
     [:SYP (make-currency "SY£" "Syrian Pound" "ل.س.‏" 0 0 "SYP" "Syrian pounds")]
     [:THB (make-currency "฿" "Thai Baht" "฿" 2 0 "THB" "Thai baht")]
     [:TND (make-currency "DT" "Tunisian Dinar" "د.ت.‏" 3 0 "TND" "Tunisian dinars")]
     [:TOP (make-currency "T$" "Tongan Paʻanga" "T$" 2 0 "TOP" "Tongan paʻanga")]
     [:TRY (make-currency "₺" "Turkish Lira" "₺" 2 0 "TRY" "Turkish Lira")]
     [:TTD (make-currency "TT$" "Trinidad and Tobago Dollar" "$" 2 0 "TTD" "Trinidad and Tobago dollars")]
     [:TWD (make-currency "NT$" "New Taiwan Dollar" "NT$" 0 0 "TWD" "New Taiwan dollars")]
     [:TZS (make-currency "TSh" "Tanzanian Shilling" "TSh" 0 0 "TZS" "Tanzanian shillings")]
     [:UAH (make-currency "₴" "Ukrainian Hryvnia" "₴" 2 0 "UAH" "Ukrainian hryvnias")]
     [:UGX (make-currency "USh" "Ugandan Shilling" "USh" 0 0 "UGX" "Ugandan shillings")]
     [:UYU (make-currency "$U" "Uruguayan Peso" "$" 2 0 "UYU" "Uruguayan pesos")]
     [:UZS (make-currency "UZS" "Uzbekistan Som" "UZS" 0 0 "UZS" "Uzbekistan som")]
     [:VEF (make-currency "Bs.S." "Venezuelan Bolívar" "Bs.S." 2 0 "VES" "Venezuelan bolívars")]
     [:VND (make-currency "₫" "Vietnamese Dong" "₫" 0 0 "VND" "Vietnamese dong")]
     [:XAF (make-currency "FCFA" "CFA Franc BEAC" "FCFA" 0 0 "XAF" "CFA francs BEAC")]
     [:XOF (make-currency "CFA" "CFA Franc BCEAO" "CFA" 0 0 "XOF" "CFA francs BCEAO")]
     [:YER (make-currency "YR" "Yemeni Rial" "ر.ي.‏" 0 0 "YER" "Yemeni rials")]
     [:ZAR (make-currency "R" "South African Rand" "R" 2 0 "ZAR" "South African rand")]
     [:ZMK (make-currency "ZK" "Zambian Kwacha" "ZK" 0 0 "ZMW" "Zambian kwachas")]])))

(def currency-map
  "The currencies as a Clojure map."
  (into {} currency-list))

(mu/defn ^:export currency-symbol :- [:maybe :string]
  "Given a currency symbol, as a string or keyword, look it up in the currency
  map and return the symbol for it as a string."
  [currency :- [:or :string :keyword]]
  (some->> currency keyword currency-map :symbol))

(def ^{:export true
       :schema [:vector [:tuple :string ::currency-info]]}
  currency
  "Returns the list of currencies supported by Metabase, with associated metadata.
  In Clojure, it is converted to a map for quick lookup of currency symbols during XLSX
  exports. In ClojureScript, it is kept as a 2D array to maintain the order of currencies."
  #?(:clj  currency-map
     :cljs (clj->js currency-list)))
