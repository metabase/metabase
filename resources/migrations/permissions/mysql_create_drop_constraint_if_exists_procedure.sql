CREATE PROCEDURE IF NOT EXISTS DropNoDataPermissionsConstraintIfExists()
BEGIN
    IF (SELECT COUNT(*)
        FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'permissions' AND CONSTRAINT_NAME = 'no_data_permissions') > 0
    THEN
        SET @sql = 'ALTER TABLE permissions DROP CONSTRAINT no_data_permissions';
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END
$$
