(ns metabase.prototype.field-categories-seed
  "Prototype: field categories for the prototype dataset, for instances without an LLM. The categories of the large
  tables come from an LLM run of [[metabase.prototype.field-categories]]. Each category lists Field names in table
  order. Fields that no category lists go into \"Other\".")

(def categories
  "Categories by table name, as `[category-name [field-name ...]]` pairs, the most important category first."
  {"countries"
   [["Identifiers" ["id" "code" "name"]]
    ["Geography" ["continent" "area_km2" "capital" "capital_latitude" "capital_longitude"]]
    ["Economy" ["population" "gdp_usd_billions" "gdp_per_capita"]]
    ["Country Info" ["independence_date" "languages" "is_eu_member"]]
    ["Society" ["happiness_score" "internet_penetration"]]
    ["Media" ["flag_url" "wikipedia_url"]]]

   "customers"
   [["Identifiers" ["id" "uuid"]]
    ["Personal Information" ["full_name" "email" "avatar_url" "website" "phone" "birth_date"]]
    ["Location" ["address" "city" "state" "country" "zip" "latitude" "longitude"]]
    ["Subscription & Plan" ["plan" "status" "source" "lifetime_value"]]
    ["Engagement & Satisfaction" ["satisfaction_score" "nps_score"]]
    ["User Preferences" ["preferences → language" "preferences → interests" "preferences → newsletter"
                         "preferences → theme" "preferences"]]
    ["Account Status" ["is_verified" "marketing_opt_in"]]
    ["Lifecycle Dates" ["signed_up_at" "last_seen_at" "churned_at"]]]

   "orders"
   [["Identifiers" ["id" "customer_id" "product_id" "store_id"]]
    ["Order Details" ["channel" "status" "quantity" "coupon_code" "is_gift" "gift_message"]]
    ["Pricing" ["unit_price" "subtotal" "discount" "tax" "total" "discount_rate"]]
    ["Order Timeline" ["ordered_at" "shipped_on" "delivered_at" "delivery_hours"]]
    ["Shipping Location" ["shipping_city" "shipping_state" "shipping_country" "shipping_zip" "shipping_latitude"
                          "shipping_longitude"]]]

   "products"
   [["Identifiers" ["id" "sku" "ean"]]
    ["Product Information" ["title" "category" "subcategory" "brand" "image_url" "product_url" "description" "tags"
                            "attributes"]]
    ["Product Attributes" ["attributes → recyclable" "attributes → warranty_years" "attributes → dimensions_cm → d"
                           "attributes → material" "attributes → dimensions_cm → w" "attributes → color"
                           "attributes → dimensions_cm → h" "weight_kg" "color"]]
    ["Pricing & Margins" ["price" "cost" "gross_margin" "discount_rate"]]
    ["Customer Reviews" ["rating" "review_count"]]
    ["Lifecycle & Status" ["is_featured" "created_at" "updated_at" "discontinued_at"]]]

   "reviews"
   [["Identifiers" ["id" "product_id" "customer_id"]]
    ["Review Content" ["title" "body" "photo_url"]]
    ["Rating & Feedback" ["rating" "sentiment" "helpful_votes"]]
    ["Review Details" ["verified_purchase" "created_at"]]]

   "stores"
   [["Identifiers" ["id" "name"]]
    ["Store Details" ["store_type" "square_feet" "monthly_rent" "employee_count" "rating"]]
    ["Location" ["address" "city" "state" "country" "zip" "latitude" "longitude"]]
    ["Lifecycle Dates" ["opened_on" "closed_on"]]
    ["Contact Information" ["manager_email" "phone" "website_url"]]
    ["Operating Hours" ["opening_time" "closing_time"]]]

   "support_tickets"
   [["Identifiers" ["id" "customer_id"]]
    ["Ticket Content" ["subject" "body" "tags"]]
    ["Status & Routing" ["priority" "status" "channel" "assignee"]]
    ["Performance" ["csat_score" "first_response_minutes" "resolution_hours"]]
    ["Lifecycle Dates" ["created_at" "resolved_at"]]]

   "us_states"
   [["Identifiers" ["id" "code" "name"]]
    ["Geography" ["region" "capital" "capital_latitude" "capital_longitude" "area_sq_mi"]]
    ["Economy" ["population" "median_household_income" "unemployment_rate" "sales_tax_rate"]]]

   "web_events"
   [["Identifiers" ["id" "customer_id" "session_id"]]
    ["Event Timing" ["occurred_at" "local_time" "duration_ms"]]
    ["Page & Navigation" ["properties → query" "page_url" "referrer_url"]]
    ["Traffic Source" ["properties → experiment" "properties → utm_source"]]
    ["Event Properties" ["properties → cart_size" "revenue"]]
    ["Device & Browser" ["device" "browser" "os" "ip_address"]]
    ["Location" ["city" "country" "latitude" "longitude"]]]})
