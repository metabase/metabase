
<<CTE>>

SELECT
	account.*
    , parent_account.name as parent_account_name
    , owner.name as owner_name
    , creator.name as created_by_name
	, modifier.name as modified_by_name
FROM cte account
LEFT JOIN <<source.account>> parent_account
	ON account.parent_id = parent_account.id
LEFT JOIN <<source.user>> creator
	ON account.created_by_id = creator.id
LEFT JOIN <<source.user>> owner
	ON account.owner_id = owner.id
LEFT JOIN <<source.user>> modifier
	ON account.last_modified_by_id = modifier.id
WHERE NOT(account._fivetran_deleted)
AND account.is_deleted = false

