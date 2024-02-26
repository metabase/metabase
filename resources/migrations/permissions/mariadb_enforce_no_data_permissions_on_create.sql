CREATE TRIGGER enforce_no_data_permissions_on_create
BEFORE INSERT ON permissions
FOR EACH ROW
BEGIN
  IF NEW.object LIKE '%/db/%' THEN
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'No data permissions in Permissions allowed';
  END IF;
END;

$$
