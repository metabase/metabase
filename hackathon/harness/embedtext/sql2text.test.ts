import { test } from "node:test";
import assert from "node:assert/strict";
import { humanize, sqlToText } from "./sql2text.ts";

const T = { fct_returns: "Returns", fct_orders_v2: "Orders (v2)", dim_customer: "Customers", hr_employees: "Employees", hr_terminations: "Employee terminations" };

test("identifiers are normalised", () => {
  assert.equal(humanize("net_amount_eur"), "net amount EUR");
  assert.equal(humanize("o.customer_id"), "customer");
  assert.equal(humanize("mrr_eur"), "monthly recurring revenue EUR");
});

test("aggregate alias, group by, date window and joins", () => {
  const sql = `select c.country, sum(r.refund_amount) as refunded from analytics.fct_returns r
    join analytics.fct_orders_v2 o on o.order_line_id = r.order_line_id join analytics.dim_customer c on c.customer_id = o.customer_id
    where r.returned_at >= now() - interval '90 days' group by 1`;
  assert.equal(sqlToText(sql, T), "Refunded by country, where in the last 90 days. From Returns, Orders (v2), Customers.");
});

test("anti-join reads as an exclusion, not a null check", () => {
  const sql = `select e.location, count(*) as employees from analytics.hr_employees e
    left join analytics.hr_terminations t using (employee_id) where t.employee_id is null group by 1`;
  assert.match(sqlToText(sql, T), /excluding any in Employee terminations/);
});

test("CASE labels become buckets, and output is deterministic", () => {
  const sql = `select case when reason_code like 'SIZE%' then 'sizing' else 'other' end as bucket, count(*) as returns
    from analytics.fct_returns group by 1`;
  const a = sqlToText(sql, T);
  assert.equal(a, sqlToText(sql, T));
  assert.match(a, /^Returns by bucket\. Grouped into sizing, other\./);
});
