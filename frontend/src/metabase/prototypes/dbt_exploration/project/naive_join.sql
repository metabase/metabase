-- What a "one table + join" metric does: join the two facts, then aggregate.
-- Each invoice row is repeated once per matching time entry (and vice versa) -> fan-out.
select date_trunc('month', i.invoice_date) as month, c.customer_name,
       sum(i.amount)                    as revenue,
       sum(t.hours)                     as billable_hours,
       sum(i.amount) / sum(t.hours)     as revenue_per_billable_hour
from main.fct_invoices i
join main.fct_time_entries t
  on t.customer_id = i.customer_id
 and date_trunc('month', t.entry_date) = date_trunc('month', i.invoice_date)
join main.dim_customers c on c.customer_id = i.customer_id
where i.status = 'paid' and t.is_billable
group by all order by 1, 2;
