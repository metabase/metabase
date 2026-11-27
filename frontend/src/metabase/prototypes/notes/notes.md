## Filtering a pill vs filtering the whole metric

A filter can sit on one pill of the formula or on the whole new metric. When
the pills come from different tables, the two give different numbers, and the
same filter pill can look identical in both places.

Take **Reviews count ÷ Orders count**: reviews written per order placed, a review rate. In
the Sample Database the two tables meet only through Products:

```
Orders  ──Product ID──►  Products  ◄──Product ID──  Reviews
   │
   └──User ID──► People
```

A review has no link to an order or to a customer. So the metric can be sliced
by time (each side's own Created At) and by product (Category, Vendor, Title),
but not by customer.

Now filter it by **Rating ≤ 2**. Rating is a column of Reviews, so only the
numerator can see it. Made-up numbers for one month:

- 1,000 orders and 80 reviews
- 20 of those reviews are rated 2 or lower
- the products with such a review account for 400 of the orders

|                                         |                           Numerator (Reviews) |                                                          Denominator (Orders) | Per 100 orders |
| --------------------------------------- | --------------------------------------------: | ----------------------------------------------------------------------------: | -------------: |
| No filter                               |                                            80 |                                                                         1,000 |        **8.0** |
| Apply where it fits                     | 20 <span class="note">bad reviews only</span> |                    1,000 <span class="note">all orders, filter skipped</span> |        **2.0** |
| "Orders of products with such a review" |                                            20 | 400 <span class="note">orders of products with at least one bad review</span> |        **5.0** |

<div class="callout">
<strong>Same filter, two questions.</strong>
2.0 is <em>bad reviews per order</em>. 5.0 is <em>bad reviews per order of a
product that got a bad review</em>. Both are legitimate, and nothing on the
filter pill says which one you get.
</div>

### What we decided

- **Filter on a pill** applies to that pill only. To get 2.0, filter the
  Reviews pill: `Reviews count [Rating ≤ 2] ÷ Orders count`. The formula shows exactly
  which side is filtered.
- **Filter on the whole metric** is offered only on dimensions every pill has
  (mapped in the Dimensions tab). Review Rating is not one of them, so it can't
  be put there, and there is no silent "apply where it fits".
- **A metric used as a pill** is opaque: it can be filtered only by the
  dimensions its own pills share. To filter one of its sides, rebuild it from
  its parts.
- **"Orders of products with such a review"** (5.0) is a different query: the
  Orders side is narrowed by a lookup into Reviews. It would be a top-level
  metric filter, if we support it at all. Not in this iteration.

<p class="aside">
On a dimension every pill has, like Product category, "apply where it fits" and
the top-level filter give the same number, so the whole-metric filter is safe
there.
</p>

<div class="callout">
<strong>Watch out for name matches.</strong>
Orders can reach <code>Products → Rating</code> (the product's average), and
Reviews has its own <code>Rating</code> (one review's stars). Same name, same
type, different meaning. Pairing them by default would make "Rating ≤ 2" look
like a shared dimension, so name matches may need confirming, like semantic
ones.
</div>
