-- MetricFlow needs a day-grain date table to join metrics onto a shared metric_time.
select cast(d as date) as date_day
from range(date '2025-01-01', date '2027-01-01', interval 1 day) t(d)
