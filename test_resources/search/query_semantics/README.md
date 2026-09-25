# Search semantics fixtures

The manifest lists isolated scenarios in test order. Each `S*.edn` file holds
the documents, one query and its expected result sets, and any `T` comparisons
that reuse those documents. Assertions compare membership, not ranking.

An engine omitted from a comparison's `:alternatives` inherits the scenario's
query and result set. An alternative supplies a complete query/hits pair. Its
hits are the expected result of that query, not a difference from the target
engine. The comparison's `:target` must reproduce its scenario result set; the
runner checks that invariant.

The semantic scenario expectation names the `:keyword` and `:vector` arms
separately. The hybrid expectation is their set union. Comparison alternatives
for `:semantic` give only the hybrid hits.
