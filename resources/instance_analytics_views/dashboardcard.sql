create or replace view v_dashboardcard AS
select
    concat('dashboardcard_', id) as id,
    concat('dashboard_', dashboard_id) as dashboard_id,
    case
        when dashboard_tab_id is not null
        then concat('dashboardtab_', dashboard_tab_id)
        end as dashboardtab_id,
    case
        when card_id is not null
        then concat('question_', card_id)
        end as question_id,
    created_at,
    updated_at,
    size_x,
    size_y,
    row,
    col,
    visualization_settings,
    parameter_mappings
from report_dashboardcard
order by dashboard_id