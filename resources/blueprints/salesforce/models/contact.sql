
<<CTE>>

  select
	contact.*
    , owner.name as owner_name
    , creator.name as created_by_name
	, modifier.name as modified_by_name
  from cte as contact
  left join <<transformed.account>> as account
    on contact.account_id = account.id
  left join <<source.user>> as owner
    on contact.owner_id = owner.id
  left join <<source.user>> as creator
    on contact.created_by_id = creator.id
  left join <<source.user>> as modifier
    on contact.last_modified_by_id = modifier.id
  where contact.is_deleted = false
