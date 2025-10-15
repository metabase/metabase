
<<CTE>>

select
	opp.*
	, case when stage_name in ('Closed Won') then 'won'
			when stage_name in ('Closed Lost') then 'lost'
			else 'open' end as status
	, account.name as account_name
    , owner.name as owner_name
    , creator.name as created_by_name
	, modifier.name as modified_by_name
from cte opp
left join <<transformed.account>> account
	on opp.account_id = account.id
left join <<source.record_type>> as record_type
	on opp.record_type_id = record_type.id
left join <<source.user>> as owner
	on opp.owner_id = owner.id
left join <<source.user>> as creator
	on opp.created_by_id = creator.id
left join <<source.user>> as modifier
	on opp.last_modified_by_id = modifier.id
where opp.is_deleted = false
