export function openTable({ database = 1, table, mode = null } = {}) {
  const url = "/question/new?";
  const params = new URLSearchParams({ database, table });

  if (mode === "notebook") {
    params.append("mode", mode);
  }

  cy.visit(url + params.toString());
}

export function openProductsTable({ mode } = {}) {
  return openTable({ table: 1, mode });
}

export function openOrdersTable({ mode } = {}) {
  return openTable({ table: 2, mode });
}

export function openPeopleTable({ mode } = {}) {
  return openTable({ table: 3, mode });
}

export function openReviewsTable({ mode } = {}) {
  return openTable({ table: 4, mode });
}
