(ns metabase.prototype.reference-data
  "Fixed reference data for the prototype dataset. The numbers are approximate. They make the mock data look
  plausible, but they are not a source of truth.")

(def countries
  "Each entry: `[iso2 name continent population-millions gdp-usd-billions area-thousand-km2 capital capital-lat
  capital-lon independence-date languages eu-member?]`."
  [["US" "United States" "North America" 335.0 27360 9834 "Washington" 38.9072 -77.0369 "1776-07-04" ["English"] false]
   ["CA" "Canada" "North America" 40.1 2140 9985 "Ottawa" 45.4215 -75.6972 "1867-07-01" ["English" "French"] false]
   ["MX" "Mexico" "North America" 128.5 1789 1964 "Mexico City" 19.4326 -99.1332 "1810-09-16" ["Spanish"] false]
   ["BR" "Brazil" "South America" 216.4 2174 8516 "Brasília" -15.7939 -47.8828 "1822-09-07" ["Portuguese"] false]
   ["AR" "Argentina" "South America" 46.6 641 2780 "Buenos Aires" -34.6037 -58.3816 "1816-07-09" ["Spanish"] false]
   ["CL" "Chile" "South America" 19.6 335 756 "Santiago" -33.4489 -70.6693 "1818-02-12" ["Spanish"] false]
   ["CO" "Colombia" "South America" 52.1 364 1142 "Bogotá" 4.7110 -74.0721 "1810-07-20" ["Spanish"] false]
   ["PE" "Peru" "South America" 34.4 268 1285 "Lima" -12.0464 -77.0428 "1821-07-28" ["Spanish" "Quechua"] false]
   ["GB" "United Kingdom" "Europe" 68.3 3340 244 "London" 51.5074 -0.1278 nil ["English"] false]
   ["IE" "Ireland" "Europe" 5.3 545 70 "Dublin" 53.3498 -6.2603 "1922-12-06" ["English" "Irish"] true]
   ["FR" "France" "Europe" 68.2 3031 644 "Paris" 48.8566 2.3522 nil ["French"] true]
   ["DE" "Germany" "Europe" 84.5 4456 357 "Berlin" 52.5200 13.4050 nil ["German"] true]
   ["ES" "Spain" "Europe" 48.4 1581 506 "Madrid" 40.4168 -3.7038 nil ["Spanish" "Catalan"] true]
   ["PT" "Portugal" "Europe" 10.5 287 92 "Lisbon" 38.7223 -9.1393 nil ["Portuguese"] true]
   ["IT" "Italy" "Europe" 58.9 2255 301 "Rome" 41.9028 12.4964 "1861-03-17" ["Italian"] true]
   ["NL" "Netherlands" "Europe" 17.9 1118 42 "Amsterdam" 52.3676 4.9041 nil ["Dutch"] true]
   ["BE" "Belgium" "Europe" 11.8 632 31 "Brussels" 50.8503 4.3517 "1830-10-04" ["Dutch" "French" "German"] true]
   ["CH" "Switzerland" "Europe" 8.8 885 41 "Bern" 46.9480 7.4474 nil ["German" "French" "Italian"] false]
   ["AT" "Austria" "Europe" 9.1 516 84 "Vienna" 48.2082 16.3738 nil ["German"] true]
   ["SE" "Sweden" "Europe" 10.5 593 450 "Stockholm" 59.3293 18.0686 nil ["Swedish"] true]
   ["NO" "Norway" "Europe" 5.5 485 385 "Oslo" 59.9139 10.7522 "1905-06-07" ["Norwegian"] false]
   ["DK" "Denmark" "Europe" 5.9 404 43 "Copenhagen" 55.6761 12.5683 nil ["Danish"] true]
   ["FI" "Finland" "Europe" 5.6 300 338 "Helsinki" 60.1699 24.9384 "1917-12-06" ["Finnish" "Swedish"] true]
   ["PL" "Poland" "Europe" 36.7 811 313 "Warsaw" 52.2297 21.0122 "1918-11-11" ["Polish"] true]
   ["CZ" "Czechia" "Europe" 10.9 330 79 "Prague" 50.0755 14.4378 "1993-01-01" ["Czech"] true]
   ["UA" "Ukraine" "Europe" 37.0 179 604 "Kyiv" 50.4501 30.5234 "1991-08-24" ["Ukrainian"] false]
   ["GR" "Greece" "Europe" 10.4 243 132 "Athens" 37.9838 23.7275 "1821-03-25" ["Greek"] true]
   ["TR" "Turkey" "Asia" 85.3 1108 784 "Ankara" 39.9334 32.8597 "1923-10-29" ["Turkish"] false]
   ["EG" "Egypt" "Africa" 112.7 396 1010 "Cairo" 30.0444 31.2357 "1922-02-28" ["Arabic"] false]
   ["NG" "Nigeria" "Africa" 223.8 363 924 "Abuja" 9.0765 7.3986 "1960-10-01" ["English"] false]
   ["KE" "Kenya" "Africa" 55.1 108 580 "Nairobi" -1.2921 36.8219 "1963-12-12" ["Swahili" "English"] false]
   ["ZA" "South Africa" "Africa" 60.4 377 1221 "Pretoria" -25.7479 28.2293 "1910-05-31" ["Zulu" "Xhosa" "Afrikaans" "English"] false]
   ["MA" "Morocco" "Africa" 37.8 141 447 "Rabat" 34.0209 -6.8416 "1956-03-02" ["Arabic" "Berber"] false]
   ["IN" "India" "Asia" 1428.6 3550 3287 "New Delhi" 28.6139 77.2090 "1947-08-15" ["Hindi" "English"] false]
   ["CN" "China" "Asia" 1410.7 17795 9597 "Beijing" 39.9042 116.4074 nil ["Mandarin"] false]
   ["JP" "Japan" "Asia" 124.5 4213 378 "Tokyo" 35.6762 139.6503 nil ["Japanese"] false]
   ["KR" "South Korea" "Asia" 51.7 1713 100 "Seoul" 37.5665 126.9780 "1945-08-15" ["Korean"] false]
   ["SG" "Singapore" "Asia" 5.9 501 0.7 "Singapore" 1.3521 103.8198 "1965-08-09" ["English" "Malay" "Mandarin" "Tamil"] false]
   ["ID" "Indonesia" "Asia" 277.5 1371 1905 "Jakarta" -6.2088 106.8456 "1945-08-17" ["Indonesian"] false]
   ["VN" "Vietnam" "Asia" 98.9 430 331 "Hanoi" 21.0278 105.8342 "1945-09-02" ["Vietnamese"] false]
   ["TH" "Thailand" "Asia" 71.8 515 513 "Bangkok" 13.7563 100.5018 nil ["Thai"] false]
   ["PH" "Philippines" "Asia" 117.3 437 300 "Manila" 14.5995 120.9842 "1898-06-12" ["Filipino" "English"] false]
   ["AE" "United Arab Emirates" "Asia" 9.5 504 84 "Abu Dhabi" 24.4539 54.3773 "1971-12-02" ["Arabic"] false]
   ["IL" "Israel" "Asia" 9.8 509 22 "Jerusalem" 31.7683 35.2137 "1948-05-14" ["Hebrew" "Arabic"] false]
   ["AU" "Australia" "Oceania" 26.6 1724 7692 "Canberra" -35.2809 149.1300 "1901-01-01" ["English"] false]
   ["NZ" "New Zealand" "Oceania" 5.2 253 268 "Wellington" -41.2865 174.7762 "1947-11-25" ["English" "Māori"] false]])

(def us-states
  "Each entry: `[code name region capital capital-lat capital-lon population-millions area-thousand-sq-mi
  statehood-year median-household-income]`."
  [["AL" "Alabama" "South" "Montgomery" 32.3668 -86.3000 5.1 52.4 1819 59600]
   ["AK" "Alaska" "West" "Juneau" 58.3019 -134.4197 0.7 665.4 1959 86400]
   ["AZ" "Arizona" "West" "Phoenix" 33.4484 -112.0740 7.4 114.0 1912 72600]
   ["AR" "Arkansas" "South" "Little Rock" 34.7465 -92.2896 3.1 53.2 1836 56300]
   ["CA" "California" "West" "Sacramento" 38.5816 -121.4944 38.9 163.7 1850 91900]
   ["CO" "Colorado" "West" "Denver" 39.7392 -104.9903 5.9 104.1 1876 87600]
   ["CT" "Connecticut" "Northeast" "Hartford" 41.7658 -72.6734 3.6 5.5 1788 90200]
   ["DE" "Delaware" "South" "Dover" 39.1582 -75.5244 1.0 2.5 1787 79300]
   ["FL" "Florida" "South" "Tallahassee" 30.4383 -84.2807 22.6 65.8 1845 69300]
   ["GA" "Georgia" "South" "Atlanta" 33.7490 -84.3880 11.0 59.4 1788 72800]
   ["HI" "Hawaii" "West" "Honolulu" 21.3069 -157.8583 1.4 10.9 1959 92500]
   ["ID" "Idaho" "West" "Boise" 43.6150 -116.2023 2.0 83.6 1890 70200]
   ["IL" "Illinois" "Midwest" "Springfield" 39.7817 -89.6501 12.5 57.9 1818 78400]
   ["IN" "Indiana" "Midwest" "Indianapolis" 39.7684 -86.1581 6.9 36.4 1816 67200]
   ["IA" "Iowa" "Midwest" "Des Moines" 41.5868 -93.6250 3.2 56.3 1846 70600]
   ["KS" "Kansas" "Midwest" "Topeka" 39.0473 -95.6752 2.9 82.3 1861 69700]
   ["KY" "Kentucky" "South" "Frankfort" 38.2009 -84.8733 4.5 40.4 1792 60200]
   ["LA" "Louisiana" "South" "Baton Rouge" 30.4515 -91.1871 4.6 52.4 1812 57900]
   ["ME" "Maine" "Northeast" "Augusta" 44.3106 -69.7795 1.4 35.4 1820 69500]
   ["MD" "Maryland" "South" "Annapolis" 38.9784 -76.4922 6.2 12.4 1788 98500]
   ["MA" "Massachusetts" "Northeast" "Boston" 42.3601 -71.0589 7.0 10.6 1788 96500]
   ["MI" "Michigan" "Midwest" "Lansing" 42.7325 -84.5555 10.0 96.7 1837 68500]
   ["MN" "Minnesota" "Midwest" "Saint Paul" 44.9537 -93.0900 5.7 86.9 1858 84300]
   ["MS" "Mississippi" "South" "Jackson" 32.2988 -90.1848 2.9 48.4 1817 52700]
   ["MO" "Missouri" "Midwest" "Jefferson City" 38.5767 -92.1735 6.2 69.7 1821 65900]
   ["MT" "Montana" "West" "Helena" 46.5891 -112.0391 1.1 147.0 1889 67600]
   ["NE" "Nebraska" "Midwest" "Lincoln" 40.8136 -96.7026 2.0 77.3 1867 71700]
   ["NV" "Nevada" "West" "Carson City" 39.1638 -119.7674 3.2 110.6 1864 71600]
   ["NH" "New Hampshire" "Northeast" "Concord" 43.2081 -71.5376 1.4 9.3 1788 90800]
   ["NJ" "New Jersey" "Northeast" "Trenton" 40.2206 -74.7597 9.3 8.7 1787 97100]
   ["NM" "New Mexico" "West" "Santa Fe" 35.6870 -105.9378 2.1 121.6 1912 58700]
   ["NY" "New York" "Northeast" "Albany" 42.6526 -73.7562 19.6 54.6 1788 81400]
   ["NC" "North Carolina" "South" "Raleigh" 35.7796 -78.6382 10.8 53.8 1789 66200]
   ["ND" "North Dakota" "Midwest" "Bismarck" 46.8083 -100.7837 0.8 70.7 1889 73900]
   ["OH" "Ohio" "Midwest" "Columbus" 39.9612 -82.9988 11.8 44.8 1803 66900]
   ["OK" "Oklahoma" "South" "Oklahoma City" 35.4676 -97.5164 4.1 69.9 1907 59700]
   ["OR" "Oregon" "West" "Salem" 44.9429 -123.0351 4.2 98.4 1859 76400]
   ["PA" "Pennsylvania" "Northeast" "Harrisburg" 40.2732 -76.8867 13.0 46.1 1787 73200]
   ["RI" "Rhode Island" "Northeast" "Providence" 41.8240 -71.4128 1.1 1.5 1790 81400]
   ["SC" "South Carolina" "South" "Columbia" 34.0007 -81.0348 5.4 32.0 1788 64100]
   ["SD" "South Dakota" "Midwest" "Pierre" 44.3683 -100.3510 0.9 77.1 1889 69500]
   ["TN" "Tennessee" "South" "Nashville" 36.1627 -86.7816 7.1 42.1 1796 64000]
   ["TX" "Texas" "South" "Austin" 30.2672 -97.7431 30.5 268.6 1845 73000]
   ["UT" "Utah" "West" "Salt Lake City" 40.7608 -111.8910 3.4 84.9 1896 86800]
   ["VT" "Vermont" "Northeast" "Montpelier" 44.2601 -72.5754 0.6 9.6 1791 73900]
   ["VA" "Virginia" "South" "Richmond" 37.5407 -77.4360 8.7 42.8 1788 87200]
   ["WA" "Washington" "West" "Olympia" 47.0379 -122.9007 7.8 71.3 1889 91300]
   ["WV" "West Virginia" "South" "Charleston" 38.3498 -81.6326 1.8 24.2 1863 54300]
   ["WI" "Wisconsin" "Midwest" "Madison" 43.0731 -89.4012 5.9 65.5 1848 72500]
   ["WY" "Wyoming" "West" "Cheyenne" 41.1400 -104.8202 0.6 97.8 1890 72500]])

(def us-cities
  "Each entry: `[city state-code lat lon zip-prefix weight]`. A higher weight makes the city more frequent."
  [["New York" "NY" 40.7128 -74.0060 "100" 10]
   ["Brooklyn" "NY" 40.6782 -73.9442 "112" 5]
   ["Buffalo" "NY" 42.8864 -78.8784 "142" 2]
   ["Los Angeles" "CA" 34.0522 -118.2437 "900" 9]
   ["San Francisco" "CA" 37.7749 -122.4194 "941" 6]
   ["San Diego" "CA" 32.7157 -117.1611 "921" 4]
   ["San Jose" "CA" 37.3382 -121.8863 "951" 3]
   ["Sacramento" "CA" 38.5816 -121.4944 "958" 2]
   ["Chicago" "IL" 41.8781 -87.6298 "606" 7]
   ["Houston" "TX" 29.7604 -95.3698 "770" 6]
   ["Dallas" "TX" 32.7767 -96.7970 "752" 5]
   ["Austin" "TX" 30.2672 -97.7431 "787" 5]
   ["San Antonio" "TX" 29.4241 -98.4936 "782" 3]
   ["Phoenix" "AZ" 33.4484 -112.0740 "850" 4]
   ["Tucson" "AZ" 32.2226 -110.9747 "857" 2]
   ["Philadelphia" "PA" 39.9526 -75.1652 "191" 4]
   ["Pittsburgh" "PA" 40.4406 -79.9959 "152" 2]
   ["Seattle" "WA" 47.6062 -122.3321 "981" 5]
   ["Spokane" "WA" 47.6588 -117.4260 "992" 1]
   ["Portland" "OR" 45.5152 -122.6784 "972" 3]
   ["Denver" "CO" 39.7392 -104.9903 "802" 4]
   ["Boulder" "CO" 40.0150 -105.2705 "803" 1]
   ["Boston" "MA" 42.3601 -71.0589 "021" 4]
   ["Miami" "FL" 25.7617 -80.1918 "331" 4]
   ["Orlando" "FL" 28.5383 -81.3792 "328" 3]
   ["Tampa" "FL" 27.9506 -82.4572 "336" 2]
   ["Atlanta" "GA" 33.7490 -84.3880 "303" 4]
   ["Nashville" "TN" 36.1627 -86.7816 "372" 3]
   ["Memphis" "TN" 35.1495 -90.0490 "381" 1]
   ["Charlotte" "NC" 35.2271 -80.8431 "282" 3]
   ["Raleigh" "NC" 35.7796 -78.6382 "276" 2]
   ["Minneapolis" "MN" 44.9778 -93.2650 "554" 3]
   ["Detroit" "MI" 42.3314 -83.0458 "482" 2]
   ["Columbus" "OH" 39.9612 -82.9988 "432" 2]
   ["Cleveland" "OH" 41.4993 -81.6944 "441" 2]
   ["Indianapolis" "IN" 39.7684 -86.1581 "462" 2]
   ["Kansas City" "MO" 39.0997 -94.5786 "641" 2]
   ["St. Louis" "MO" 38.6270 -90.1994 "631" 2]
   ["Las Vegas" "NV" 36.1699 -115.1398 "891" 3]
   ["Salt Lake City" "UT" 40.7608 -111.8910 "841" 2]
   ["New Orleans" "LA" 29.9511 -90.0715 "701" 2]
   ["Baltimore" "MD" 39.2904 -76.6122 "212" 2]
   ["Washington" "DC" 38.9072 -77.0369 "200" 3]
   ["Milwaukee" "WI" 43.0389 -87.9065 "532" 1]
   ["Albuquerque" "NM" 35.0844 -106.6504 "871" 1]
   ["Omaha" "NE" 41.2565 -95.9345 "681" 1]
   ["Boise" "ID" 43.6150 -116.2023 "837" 1]
   ["Anchorage" "AK" 61.2181 -149.9003 "995" 1]
   ["Honolulu" "HI" 21.3069 -157.8583 "968" 1]
   ["Burlington" "VT" 44.4759 -73.2121 "054" 1]])

(def world-cities
  "Each entry: `[city country-code lat lon weight]`. A higher weight makes the city more frequent."
  [["Toronto" "CA" 43.6532 -79.3832 4]
   ["Vancouver" "CA" 49.2827 -123.1207 3]
   ["Montreal" "CA" 45.5017 -73.5673 2]
   ["Mexico City" "MX" 19.4326 -99.1332 3]
   ["Guadalajara" "MX" 20.6597 -103.3496 1]
   ["São Paulo" "BR" -23.5505 -46.6333 3]
   ["Rio de Janeiro" "BR" -22.9068 -43.1729 2]
   ["Buenos Aires" "AR" -34.6037 -58.3816 2]
   ["Santiago" "CL" -33.4489 -70.6693 1]
   ["Bogotá" "CO" 4.7110 -74.0721 1]
   ["Lima" "PE" -12.0464 -77.0428 1]
   ["London" "GB" 51.5074 -0.1278 5]
   ["Manchester" "GB" 53.4808 -2.2426 2]
   ["Dublin" "IE" 53.3498 -6.2603 2]
   ["Paris" "FR" 48.8566 2.3522 4]
   ["Lyon" "FR" 45.7640 4.8357 1]
   ["Berlin" "DE" 52.5200 13.4050 4]
   ["Munich" "DE" 48.1351 11.5820 2]
   ["Hamburg" "DE" 53.5511 9.9937 1]
   ["Madrid" "ES" 40.4168 -3.7038 2]
   ["Barcelona" "ES" 41.3874 2.1686 2]
   ["Lisbon" "PT" 38.7223 -9.1393 1]
   ["Rome" "IT" 41.9028 12.4964 2]
   ["Milan" "IT" 45.4642 9.1900 2]
   ["Amsterdam" "NL" 52.3676 4.9041 2]
   ["Brussels" "BE" 50.8503 4.3517 1]
   ["Zurich" "CH" 47.3769 8.5417 1]
   ["Vienna" "AT" 48.2082 16.3738 1]
   ["Stockholm" "SE" 59.3293 18.0686 1]
   ["Oslo" "NO" 59.9139 10.7522 1]
   ["Copenhagen" "DK" 55.6761 12.5683 1]
   ["Helsinki" "FI" 60.1699 24.9384 1]
   ["Warsaw" "PL" 52.2297 21.0122 2]
   ["Kraków" "PL" 50.0647 19.9450 1]
   ["Prague" "CZ" 50.0755 14.4378 1]
   ["Kyiv" "UA" 50.4501 30.5234 2]
   ["Lviv" "UA" 49.8397 24.0297 1]
   ["Athens" "GR" 37.9838 23.7275 1]
   ["Istanbul" "TR" 41.0082 28.9784 2]
   ["Cairo" "EG" 30.0444 31.2357 1]
   ["Lagos" "NG" 6.5244 3.3792 2]
   ["Nairobi" "KE" -1.2921 36.8219 1]
   ["Cape Town" "ZA" -33.9249 18.4241 1]
   ["Johannesburg" "ZA" -26.2041 28.0473 1]
   ["Casablanca" "MA" 33.5731 -7.5898 1]
   ["Mumbai" "IN" 19.0760 72.8777 3]
   ["Bengaluru" "IN" 12.9716 77.5946 3]
   ["Delhi" "IN" 28.7041 77.1025 2]
   ["Shanghai" "CN" 31.2304 121.4737 2]
   ["Shenzhen" "CN" 22.5431 114.0579 1]
   ["Tokyo" "JP" 35.6762 139.6503 4]
   ["Osaka" "JP" 34.6937 135.5023 1]
   ["Seoul" "KR" 37.5665 126.9780 2]
   ["Singapore" "SG" 1.3521 103.8198 2]
   ["Jakarta" "ID" -6.2088 106.8456 1]
   ["Ho Chi Minh City" "VN" 10.8231 106.6297 1]
   ["Bangkok" "TH" 13.7563 100.5018 1]
   ["Manila" "PH" 14.5995 120.9842 1]
   ["Dubai" "AE" 25.2048 55.2708 2]
   ["Tel Aviv" "IL" 32.0853 34.7818 1]
   ["Sydney" "AU" -33.8688 151.2093 3]
   ["Melbourne" "AU" -37.8136 144.9631 2]
   ["Auckland" "NZ" -36.8485 174.7633 1]])

(def first-names
  "First names for generated people."
  ["Olivia" "Liam" "Emma" "Noah" "Amelia" "Oliver" "Ava" "Elijah" "Sophia" "Mateo" "Isabella" "Lucas" "Mia" "Levi"
   "Charlotte" "Asher" "Harper" "James" "Evelyn" "Leo" "Luna" "Grayson" "Camila" "Ezra" "Gianna" "Luca" "Aria"
   "Ethan" "Ella" "Aiden" "Nova" "Wyatt" "Sofia" "Sebastian" "Hazel" "Henry" "Emily" "Mason" "Scarlett" "Muhammad"
   "Chloe" "Hudson" "Layla" "Jack" "Mila" "Daniel" "Nora" "Julian" "Zoe" "Santiago" "Priya" "Arjun" "Yuki" "Hiro"
   "Mei" "Wei" "Olena" "Taras" "Fatima" "Omar" "Aisha" "Kwame" "Ngozi" "Lars" "Ingrid" "Sven" "Chiara" "Marco"
   "Lucía" "Diego" "Camille" "Hugo" "Lena" "Felix" "Zofia" "Jakub" "Ana" "João" "Sara" "Tomás"])

(def last-names
  "Last names for generated people."
  ["Smith" "Johnson" "Williams" "Brown" "Jones" "Garcia" "Miller" "Davis" "Rodriguez" "Martinez" "Hernandez" "Lopez"
   "Gonzalez" "Wilson" "Anderson" "Thomas" "Taylor" "Moore" "Jackson" "Martin" "Lee" "Perez" "Thompson" "White"
   "Harris" "Sanchez" "Clark" "Ramirez" "Lewis" "Robinson" "Walker" "Young" "Allen" "King" "Wright" "Scott"
   "Torres" "Nguyen" "Hill" "Flores" "Green" "Adams" "Nelson" "Baker" "Hall" "Rivera" "Campbell" "Mitchell"
   "Patel" "Sharma" "Tanaka" "Sato" "Kim" "Park" "Chen" "Wang" "Kowalski" "Nowak" "Shevchenko" "Kovalenko"
   "Müller" "Schmidt" "Rossi" "Bianchi" "Dubois" "Moreau" "Silva" "Santos" "Okafor" "Mensah" "Haddad" "Larsen"
   "Johansson" "O'Brien" "Murphy" "Novák" "Popescu" "Ivanova" "Cohen" "Ali"])

(def email-domains
  "Email domains for generated people."
  ["gmail.com" "yahoo.com" "outlook.com" "hotmail.com" "icloud.com" "proton.me" "fastmail.com" "example.org"
   "acme.io" "initech.com" "globex.net" "hooli.xyz"])

(def product-categories
  "Product category to its subcategories."
  {"Electronics"   ["Headphones" "Speakers" "Cameras" "Laptops" "Phones" "Wearables"]
   "Home & Garden" ["Furniture" "Lighting" "Kitchen" "Decor" "Tools" "Outdoor"]
   "Apparel"       ["Shirts" "Shoes" "Jackets" "Hats" "Bags" "Accessories"]
   "Sports"        ["Cycling" "Running" "Camping" "Fitness" "Water Sports" "Team Sports"]
   "Toys"          ["Puzzles" "Board Games" "Building Sets" "Plush" "Outdoor Play" "STEM"]
   "Beauty"        ["Skincare" "Fragrance" "Haircare" "Makeup" "Bath" "Wellness"]
   "Books"         ["Fiction" "Non-fiction" "Comics" "Cookbooks" "Travel" "Children"]
   "Grocery"       ["Coffee" "Tea" "Snacks" "Spices" "Pantry" "Beverages"]})

(def brands
  "Brand names for products."
  ["Acme" "Northwind" "Contoso" "Umbrella" "Initech" "Globex" "Stark Supply" "Wayne Goods" "Hooli" "Vandelay"
   "Soylent" "Aperture" "Cyberdyne" "Tyrell" "Wonka" "Pied Piper" "Monarch" "Oscorp" "Gringotts" "Dunder Mifflin"])

(def product-adjectives
  "Adjectives for product titles."
  ["Ergonomic" "Rustic" "Sleek" "Practical" "Durable" "Lightweight" "Heavy-Duty" "Compact" "Deluxe" "Smart"
   "Vintage" "Modern" "Portable" "Premium" "Classic" "Eco" "Ultra" "Mini" "Pro" "Cozy"])

(def product-materials
  "Materials for product titles and attributes."
  ["Cotton" "Leather" "Steel" "Aluminum" "Bamboo" "Wool" "Linen" "Ceramic" "Glass" "Oak" "Walnut" "Silicone"
   "Carbon" "Copper" "Marble" "Plastic" "Rubber" "Silk" "Granite" "Paper"])

(def colors
  "Colors for product attributes."
  ["Black" "White" "Red" "Blue" "Green" "Yellow" "Gray" "Navy" "Beige" "Pink" "Orange" "Purple"])

(def tags
  "Tags for products and support tickets."
  ["new" "bestseller" "sale" "eco-friendly" "limited" "gift" "clearance" "trending" "premium" "bundle" "imported"
   "handmade" "exclusive" "seasonal" "refurbished"])

(def lorem-words
  "Words for generated free text."
  ["quality" "delivery" "package" "arrived" "quickly" "great" "value" "price" "color" "size" "fits" "perfectly"
   "recommend" "friends" "works" "expected" "better" "worse" "broke" "after" "week" "month" "support" "team"
   "helpful" "refund" "replacement" "instructions" "assembly" "easy" "hard" "battery" "lasts" "sturdy" "flimsy"
   "material" "soft" "comfortable" "stylish" "gift" "daughter" "son" "kitchen" "office" "travel" "weekend"
   "durable" "cheap" "expensive" "love" "okay" "fine" "disappointed" "excellent" "happy" "again" "order"])

(def store-types
  "Store formats."
  ["Flagship" "Mall" "Outlet" "Pop-up" "Warehouse" "Express"])

(def order-channels
  "Order channels."
  ["Online" "Mobile App" "In Store" "Phone" "Marketplace"])

(def plans
  "Subscription plans with their weights."
  [["Free" 50] ["Basic" 25] ["Pro" 15] ["Business" 7] ["Enterprise" 3]])

(def acquisition-sources
  "Customer acquisition sources."
  ["Organic" "Google" "Facebook" "Instagram" "TikTok" "Affiliate" "Referral" "Newsletter" "Podcast" "Billboard"])

(def event-types
  "Web event types with their weights."
  [["page_view" 55] ["click" 18] ["search" 8] ["add_to_cart" 7] ["remove_from_cart" 2] ["checkout_started" 4]
   ["purchase" 3] ["sign_up" 1] ["login" 2]])

(def devices
  "Device types with their weights."
  [["Desktop" 45] ["Mobile" 45] ["Tablet" 9] ["Smart TV" 1]])

(def browsers
  "Browsers with their weights."
  [["Chrome" 60] ["Safari" 22] ["Firefox" 7] ["Edge" 8] ["Opera" 2] ["Samsung Internet" 1]])

(def operating-systems
  "Operating systems with their weights."
  [["Windows" 32] ["macOS" 18] ["iOS" 25] ["Android" 20] ["Linux" 4] ["ChromeOS" 1]])

(def site-paths
  "Paths on the mock shop site."
  ["/" "/products" "/products/new" "/sale" "/cart" "/checkout" "/account" "/account/orders" "/help" "/blog"
   "/blog/gift-guide" "/about" "/search" "/wishlist" "/stores"])

(def referrers
  "Referrer URLs, with nil meaning direct traffic."
  [nil nil nil "https://www.google.com/" "https://www.bing.com/" "https://duckduckgo.com/"
   "https://www.facebook.com/" "https://t.co/" "https://www.instagram.com/" "https://news.ycombinator.com/"
   "https://www.reddit.com/" "https://www.youtube.com/"])

(def ticket-subjects
  "Support ticket subject templates."
  ["Where is my order?" "Item arrived damaged" "Wrong size delivered" "Request a refund" "Change shipping address"
   "Cannot log in" "Payment failed" "Discount code not working" "Question about warranty" "Cancel my subscription"
   "Product missing parts" "Invoice request" "Account locked" "Upgrade my plan" "Feedback about the website"])

(def support-agents
  "Support agent names."
  ["Alex Rivera" "Sam Chen" "Jordan Patel" "Taylor Kim" "Morgan Silva" "Casey Novak" "Riley Okafor" "Jamie Larsen"])
