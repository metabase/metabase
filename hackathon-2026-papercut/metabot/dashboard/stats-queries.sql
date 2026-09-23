-- The dashboard cards ported to ClickHouse metabase_events.pa_events on stats (Track). Never run.
-- event_data is Map(String, String), and the nested event_details map arrives as a Python-repr string,
-- e.g. {'tool_name': 'search', 'step': 1, 'error_class': 'clojure.lang.ExceptionInfo', 'agent_error': False},
-- so its string fields come out with extract(). A 7-day window replaces the local demo's "everything",
-- and the per-minute line becomes per-hour. Triage queue and "Issues written" have no stats equivalent:
-- triage_groups only exists locally.

-- Tool calls
select count() as calls
from metabase_events.pa_events
where event_name = 'ai_service_event.agent_used_tool'
  and created_at >= now() - interval 7 day;

-- Tool errors
select count() as errors
from metabase_events.pa_events
where event_name = 'ai_service_event.agent_used_tool'
  and event_data['result'] = 'error'
  and created_at >= now() - interval 7 day;

-- Papercuts found
select count() as papercuts
from metabase_events.pa_events
where event_name = 'ai_service_event.agent_turn_reviewed'
  and event_data['result'] = 'papercut'
  and created_at >= now() - interval 7 day;

-- Reviewed turns per hour, papercut vs clean
select toStartOfHour(toTimeZone(created_at, 'America/Toronto')) as hour,
       countIf(event_data['result'] = 'papercut') as papercut,
       countIf(event_data['result'] = 'clean') as clean
from metabase_events.pa_events
where event_name = 'ai_service_event.agent_turn_reviewed'
  and created_at >= now() - interval 7 day
group by hour
order by hour with fill step interval 1 hour;

-- Metabot tool calls by tool and result
select extract(event_data['event_details'], '\'tool_name\': \'([^\']*)\'') as tool,
       event_data['result'] as result,
       count() as calls
from metabase_events.pa_events
where event_name = 'ai_service_event.agent_used_tool'
  and created_at >= now() - interval 7 day
group by tool, result
order by tool, result;

-- Latest findings
select formatDateTime(toTimeZone(created_at, 'America/Toronto'), '%b %d %H:%i:%S') as "Time",
       replaceOne(event_name, 'ai_service_event.', '') as "Event",
       extract(event_data['event_details'], '\'tool(?:_name)?\': \'([^\']*)\'') as "Tool",
       extract(event_data['event_details'], '\'error_class\': \'([^\']*)\'') as "Error class",
       extract(event_data['event_details'], '\'signals\': \'([^\']*)\'') as "Signals",
       extract(event_data['event_details'], '\'category\': \'([^\']*)\'') as "Category",
       event_data['session_id'] as "Conversation"
from metabase_events.pa_events
where created_at >= now() - interval 7 day
  and ((event_name = 'ai_service_event.agent_used_tool' and event_data['result'] = 'error')
    or (event_name = 'ai_service_event.agent_turn_reviewed' and event_data['result'] = 'papercut'))
order by created_at desc
limit 50;

-- Tool errors by tool and error class
select extract(event_data['event_details'], '\'tool_name\': \'([^\']*)\'') as tool,
       extract(event_data['event_details'], '\'error_class\': \'([^\']*)\'') as error_class,
       count() as errors
from metabase_events.pa_events
where event_name = 'ai_service_event.agent_used_tool'
  and event_data['result'] = 'error'
  and created_at >= now() - interval 7 day
group by tool, error_class
order by errors desc;

-- Papercuts by category
select extract(event_data['event_details'], '\'category\': \'([^\']*)\'') as category,
       count() as papercuts
from metabase_events.pa_events
where event_name = 'ai_service_event.agent_turn_reviewed'
  and event_data['result'] = 'papercut'
  and created_at >= now() - interval 7 day
group by category
order by papercuts desc;

-- Turn review signals by verdict
select trim(arrayJoin(splitByChar(',', extract(event_data['event_details'], '\'signals\': \'([^\']*)\'')))) as signal,
       event_data['result'] as result,
       count() as turns
from metabase_events.pa_events
where event_name = 'ai_service_event.agent_turn_reviewed'
  and created_at >= now() - interval 7 day
group by signal, result
having signal != ''
order by turns desc;
