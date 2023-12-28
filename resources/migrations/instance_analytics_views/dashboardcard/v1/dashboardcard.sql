drop view if exists v_dashboardcard;

create or replace view v_dashboardcard AS
select
    id as entity_id,
    concat('dashboardcard_', id) as entity_qualified_id,
    concat('dashboard_', dashboard_id) as dashboard_qualified_id,
    concat('dashboardtab_', dashboard_tab_id) as dashboardtab_id,
    concat('card_', card_id) as card_qualified_id,
    created_at,
    updated_at,
    size_x,
    size_y,
    visualization_settings,
    parameter_mappings
from report_dashboardcard
