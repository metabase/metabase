export const ORDERS_PRODUCTS_ACCESS = "orders_products_access";

export const getCreatePostgresRoleIfNotExistSql = (roleName, grantSql) => {
  return `
    DO
    $do$
    BEGIN
      IF NOT EXISTS ( SELECT FROM pg_roles
                      WHERE  rolname = '${roleName}') THEN

        CREATE ROLE ${roleName};
        ${grantSql}

      END IF;
    END
    $do$;
  `;
};

export const Roles = {
  postgres: {
    [ORDERS_PRODUCTS_ACCESS]: getCreatePostgresRoleIfNotExistSql(
      ORDERS_PRODUCTS_ACCESS,
      `
    GRANT SELECT, INSERT, UPDATE, DELETE ON Orders TO ${ORDERS_PRODUCTS_ACCESS};
    GRANT SELECT, INSERT, UPDATE, DELETE ON Products TO ${ORDERS_PRODUCTS_ACCESS};
  `,
    ),
  },
};
