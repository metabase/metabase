-- OceanBase initialization script for Metabase tests
-- This file will be automatically executed by OceanBase container

-- Create test database with special characters (similar to ClickHouse tests)
DROP DATABASE IF EXISTS `Special@Characters~`;
CREATE DATABASE `Special@Characters~`;

-- Create test database for Metabase tests
DROP DATABASE IF EXISTS `metabase_test`;
CREATE DATABASE `metabase_test`;

-- Use the test database
USE `metabase_test`;

-- Create test tables for basic functionality testing
CREATE TABLE IF NOT EXISTS `test_table` (
  `id` INT PRIMARY KEY,
  `name` VARCHAR(255),
  `value` DECIMAL(10,2),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert some test data
INSERT INTO `test_table` (`id`, `name`, `value`) VALUES
  (1, 'test1', 100.50),
  (2, 'test2', 200.75),
  (3, 'test3', 300.25);

-- Create a view for testing
CREATE OR REPLACE VIEW `test_view` AS
SELECT * FROM `test_table` WHERE `value` > 150;

-- Grant permissions to test user
GRANT ALL PRIVILEGES ON `metabase_test`.* TO 'root'@'%';
GRANT ALL PRIVILEGES ON `Special@Characters~`.* TO 'root'@'%';
FLUSH PRIVILEGES;
