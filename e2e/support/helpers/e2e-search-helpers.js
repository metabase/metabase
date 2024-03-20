export function getSearchBar() {
  return cy.findByPlaceholderText("Search…");
}

/**
 * Checks the search results against expectedSearchValues, including descriptions,
 * collection names, and timestamps, depending on the given data.
 *
 * @param {Object} options - Options for the test.
 * @param {Object[]} options.expectedSearchResults - An array of search result items to compare against.
 * @param {string} options.expectedSearchResults[].name - The name of the search result item.
 * @param {string} options.expectedSearchResults[].description - The description of the search result item.
 * @param {string} options.expectedSearchResults[].collection - The collection label of the search result item.
 * @param {string} options.expectedSearchResults[].timestamp - The timestamp label of the search result item .
 * @param {boolean} [strict=true] - Whether to check if the contents AND length of search results are the same
 */
export function expectSearchResultContent({
  expectedSearchResults,
  strict = true,
}) {
  const searchResultItemSelector = "[data-testid=search-result-item]";

  const searchResultItems = cy.get(searchResultItemSelector);

  searchResultItems.then($results => {
    if (strict) {
      // Check if the length of the search results is the same as the expected length
      expect($results).to.have.length(expectedSearchResults.length);
    }
  });

  for (const expectedSearchResult of expectedSearchResults) {
    cy.contains(searchResultItemSelector, expectedSearchResult.name).within(
      () => {
        cy.findByTestId("search-result-item-name").findByText(
          expectedSearchResult.name,
        );

        if (expectedSearchResult.description) {
          cy.findByTestId("result-description").findByText(
            expectedSearchResult.description,
          );
        }

        if (expectedSearchResult.collection) {
          cy.findAllByTestId("result-link-wrapper").first(() => {
            cy.findByText(expectedSearchResult.collection).should("exist");
          });
        }
        if (expectedSearchResult.timestamp) {
          cy.findByTestId("revision-history-button").findByText(
            expectedSearchResult.timestamp,
          );
        }
        if (expectedSearchResult.icon) {
          cy.icon(expectedSearchResult.icon);
        }
      },
    );
  }
}
