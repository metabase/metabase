SELECT
  DATE_TRUNC('month', "__mb_source"."date_joined") AS "date_joined",
  SUM(COALESCE("__mb_source"."count", 0)) - SUM(
    COALESCE(
      "Cumulative count of all deactivated users - Date Jo_4f8ec2fd"."count",
      0
    )
  ) AS "Net users"
FROM
  (
    SELECT
      "__mb_source"."date_joined" AS "date_joined",
      SUM(COUNT(*)) OVER (
        ORDER BY
          "__mb_source"."date_joined" ASC ROWS UNBOUNDED PRECEDING
      ) AS "count"
    FROM
      (
        SELECT
          DATE_TRUNC('month', "__mb_source"."date_joined") AS "date_joined"
        FROM
          (
            SELECT
              "public"."v_users"."user_id" AS "user_id",
              "public"."v_users"."entity_qualified_id" AS "entity_qualified_id",
              "public"."v_users"."type" AS "type",
              "public"."v_users"."email" AS "email",
              "public"."v_users"."first_name" AS "first_name",
              "public"."v_users"."last_name" AS "last_name",
              "public"."v_users"."full_name" AS "full_name",
              "public"."v_users"."date_joined" AS "date_joined",
              "public"."v_users"."last_login" AS "last_login",
              "public"."v_users"."updated_at" AS "updated_at",
              "public"."v_users"."is_admin" AS "is_admin",
              "public"."v_users"."is_active" AS "is_active",
              "public"."v_users"."sso_source" AS "sso_source",
              "public"."v_users"."locale" AS "locale",
              "public"."v_users"."tenant_id" AS "tenant_id",
              "public"."v_users"."tenant_qualified_id" AS "tenant_qualified_id",
              "v_tenants__via__tenant_id"."name" AS "v_tenants__via__tenant_id__name"
            FROM
              "public"."v_users"
              LEFT JOIN (
                SELECT
                  "public"."v_tenants"."tenant_id" AS "tenant_id",
                  "public"."v_tenants"."entity_qualified_id" AS "entity_qualified_id",
                  "public"."v_tenants"."name" AS "name",
                  "public"."v_tenants"."slug" AS "slug",
                  "public"."v_tenants"."is_active" AS "is_active",
                  "public"."v_tenants"."attributes" AS "attributes",
                  "public"."v_tenants"."created_at" AS "created_at",
                  "public"."v_tenants"."updated_at" AS "updated_at",
                  "public"."v_tenants"."tenant_collection_id" AS "tenant_collection_id",
                  "public"."v_tenants"."tenant_collection_qualified_id" AS "tenant_collection_qualified_id"
                FROM
                  "public"."v_tenants"
              ) AS "v_tenants__via__tenant_id" ON "public"."v_users"."tenant_id" = "v_tenants__via__tenant_id"."tenant_id"
          ) AS "__mb_source"
        WHERE
          "__mb_source"."type" = ?
      ) AS "__mb_source"
    GROUP BY
      "__mb_source"."date_joined"
    ORDER BY
      "__mb_source"."date_joined" ASC
  ) AS "__mb_source"
  FULL JOIN (
    SELECT
      "__mb_source"."updated_at" AS "updated_at",
      "__mb_source"."count" AS "count"
    FROM
      (
        SELECT
          "__mb_source"."updated_at" AS "updated_at",
          SUM(COUNT(*)) OVER (
            ORDER BY
              "__mb_source"."updated_at" ASC ROWS UNBOUNDED PRECEDING
          ) AS "count"
        FROM
          (
            SELECT
              "__mb_source"."updated_at" AS "updated_at"
            FROM
              (
                SELECT
                  DATE_TRUNC('month', "__mb_source"."updated_at") AS "updated_at"
                FROM
                  (
                    SELECT
                      "public"."v_users"."user_id" AS "user_id",
                      "public"."v_users"."entity_qualified_id" AS "entity_qualified_id",
                      "public"."v_users"."type" AS "type",
                      "public"."v_users"."email" AS "email",
                      "public"."v_users"."first_name" AS "first_name",
                      "public"."v_users"."last_name" AS "last_name",
                      "public"."v_users"."full_name" AS "full_name",
                      "public"."v_users"."date_joined" AS "date_joined",
                      "public"."v_users"."last_login" AS "last_login",
                      "public"."v_users"."updated_at" AS "updated_at",
                      "public"."v_users"."is_admin" AS "is_admin",
                      "public"."v_users"."is_active" AS "is_active",
                      "public"."v_users"."sso_source" AS "sso_source",
                      "public"."v_users"."locale" AS "locale",
                      "public"."v_users"."tenant_id" AS "tenant_id",
                      "public"."v_users"."tenant_qualified_id" AS "tenant_qualified_id",
                      "v_tenants__via__tenant_id"."name" AS "v_tenants__via__tenant_id__name"
                    FROM
                      "public"."v_users"
                      LEFT JOIN (
                        SELECT
                          "public"."v_tenants"."tenant_id" AS "tenant_id",
                          "public"."v_tenants"."entity_qualified_id" AS "entity_qualified_id",
                          "public"."v_tenants"."name" AS "name",
                          "public"."v_tenants"."slug" AS "slug",
                          "public"."v_tenants"."is_active" AS "is_active",
                          "public"."v_tenants"."attributes" AS "attributes",
                          "public"."v_tenants"."created_at" AS "created_at",
                          "public"."v_tenants"."updated_at" AS "updated_at",
                          "public"."v_tenants"."tenant_collection_id" AS "tenant_collection_id",
                          "public"."v_tenants"."tenant_collection_qualified_id" AS "tenant_collection_qualified_id"
                        FROM
                          "public"."v_tenants"
                      ) AS "v_tenants__via__tenant_id" ON "public"."v_users"."tenant_id" = "v_tenants__via__tenant_id"."tenant_id"
                  ) AS "__mb_source"
                WHERE
                  ("__mb_source"."is_active" = FALSE)
                  AND ("__mb_source"."type" = ?)
              ) AS "__mb_source"
          ) AS "__mb_source"
        GROUP BY
          "__mb_source"."updated_at"
        ORDER BY
          "__mb_source"."updated_at" ASC
      ) AS "__mb_source"
  ) AS "Cumulative count of all deactivated users - Date Jo_4f8ec2fd" ON DATE_TRUNC('month', "__mb_source"."date_joined") = DATE_TRUNC(
    'month',
    "Cumulative count of all deactivated users - Date Jo_4f8ec2fd"."updated_at"
  )
GROUP BY
  DATE_TRUNC('month', "__mb_source"."date_joined")
ORDER BY
  DATE_TRUNC('month', "__mb_source"."date_joined") ASC,
  DATE_TRUNC('month', "__mb_source"."date_joined") ASC
