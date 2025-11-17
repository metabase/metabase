
<<CTE>>

 select
 	lead.*
	, owner.name as owner_name
    , creator.name as created_by_name
	, modifier.name as modified_by_name
 from cte as lead
  left join <<transformed.account>> as account
    on lead.account_id_custom = account.id
  left join <<source.user>> as owner
    on lead.owner_id = owner.id
  left join <<source.user>> as creator
    on lead.created_by_id = creator.id
  left join <<source.user>> as modifier
    on lead.last_modified_by_id = modifier.id
  left join <<transformed.account>> as converted_account
      on lead.converted_account_id = converted_account.id
  left join <<transformed.contact>> as converted_contact
      on lead.converted_contact_id = converted_contact.id
  left join <<transformed.opportunity>> as converted_opportunity
      on lead.converted_opportunity_id = converted_opportunity.id
  where lead.is_deleted = false
