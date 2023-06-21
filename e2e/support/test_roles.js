export const ORDERS_PRODUCTS_ACCESS = "orders_products_access";

const createRoleIfNotExist = (roleName, grantSql) => {
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
  [ORDERS_PRODUCTS_ACCESS]: createRoleIfNotExist(
    ORDERS_PRODUCTS_ACCESS,
    `
    GRANT SELECT, INSERT, UPDATE, DELETE ON Orders TO ${ORDERS_PRODUCTS_ACCESS};
    GRANT SELECT, INSERT, UPDATE, DELETE ON Products TO ${ORDERS_PRODUCTS_ACCESS};
  `,
  ),
};
