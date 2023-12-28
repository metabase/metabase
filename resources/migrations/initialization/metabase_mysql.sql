-- This is manually added;
ALTER DATABASE CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `activity`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity` (
  `id` int NOT NULL AUTO_INCREMENT,
  `topic` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `timestamp` datetime NOT NULL,
  `user_id` int DEFAULT NULL,
  `model` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model_id` int DEFAULT NULL,
  `database_id` int DEFAULT NULL,
  `table_id` int DEFAULT NULL,
  `custom_id` varchar(48) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `details` longtext COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_activity_timestamp` (`timestamp`),
  KEY `idx_activity_user_id` (`user_id`),
  KEY `idx_activity_custom_id` (`custom_id`),
  CONSTRAINT `fk_activity_ref_user_id` FOREIGN KEY (`user_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `application_permissions_revision`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `application_permissions_revision` (
  `id` int NOT NULL AUTO_INCREMENT,
  `before` longtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Serialized JSON of the permission graph before the changes.',
  `after` longtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Serialized JSON of the changes in permission graph.',
  `user_id` int NOT NULL COMMENT 'The ID of the admin who made this set of changes.',
  `created_at` datetime NOT NULL COMMENT 'The timestamp of when these changes were made.',
  `remark` longtext COLLATE utf8mb4_unicode_ci COMMENT 'Optional remarks explaining why these changes were made.',
  PRIMARY KEY (`id`),
  KEY `fk_general_permissions_revision_user_id` (`user_id`),
  CONSTRAINT `fk_general_permissions_revision_user_id` FOREIGN KEY (`user_id`) REFERENCES `core_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Used to keep track of changes made to general permissions.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `bookmark_ordering`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bookmark_ordering` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT 'ID of the User who ordered bookmarks',
  `type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'type of the Bookmark',
  `item_id` int NOT NULL COMMENT 'id of the item being bookmarked (Card, Collection, Dashboard, ...) no FK, so may no longer exist',
  `ordering` int NOT NULL COMMENT 'order of bookmark for user',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_bookmark_user_id_type_item_id` (`user_id`,`type`,`item_id`),
  UNIQUE KEY `unique_bookmark_user_id_ordering` (`user_id`,`ordering`),
  KEY `idx_bookmark_ordering_user_id` (`user_id`),
  CONSTRAINT `fk_bookmark_ordering_user_id` FOREIGN KEY (`user_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Table holding ordering information for various bookmark tables';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `card_bookmark`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `card_bookmark` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT 'ID of the User who bookmarked the Card',
  `card_id` int NOT NULL COMMENT 'ID of the Card bookmarked by the user',
  `created_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'The timestamp of when the bookmark was created',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_card_bookmark_user_id_card_id` (`user_id`,`card_id`),
  KEY `idx_card_bookmark_user_id` (`user_id`),
  KEY `idx_card_bookmark_card_id` (`card_id`),
  CONSTRAINT `fk_card_bookmark_dashboard_id` FOREIGN KEY (`card_id`) REFERENCES `report_card` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_card_bookmark_user_id` FOREIGN KEY (`user_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Table holding bookmarks on cards';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `card_label`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `card_label` (
  `id` int NOT NULL AUTO_INCREMENT,
  `card_id` int NOT NULL,
  `label_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_card_label_card_id_label_id` (`card_id`,`label_id`),
  KEY `idx_card_label_card_id` (`card_id`),
  KEY `idx_card_label_label_id` (`label_id`),
  CONSTRAINT `fk_card_label_ref_card_id` FOREIGN KEY (`card_id`) REFERENCES `report_card` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_card_label_ref_label_id` FOREIGN KEY (`label_id`) REFERENCES `label` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `collection`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `collection` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` longtext COLLATE utf8mb4_unicode_ci,
  `description` longtext COLLATE utf8mb4_unicode_ci,
  `color` char(7) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Seven-character hex color for this Collection, including the preceding hash sign.',
  `archived` bit(1) NOT NULL DEFAULT b'0' COMMENT 'Whether this Collection has been archived and should be hidden from users.',
  `location` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '/' COMMENT 'Directory-structure path of ancestor Collections. e.g. "/1/2/" means our Parent is Collection 2, and their parent is Collection 1.',
  `personal_owner_id` int DEFAULT NULL COMMENT 'If set, this Collection is a personal Collection, for exclusive use of the User with this ID.',
  `slug` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `namespace` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'The namespace (hierachy) this Collection belongs to. NULL means the Collection is in the default namespace.',
  `authority_level` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Nullable column to incidate collection''s authority level. Initially values are "official" and nil.',
  `entity_id` char(21) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Random NanoID tag for unique identity.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_collection_personal_owner_id` (`personal_owner_id`),
  UNIQUE KEY `entity_id` (`entity_id`),
  KEY `idx_collection_location` (`location`),
  KEY `idx_collection_personal_owner_id` (`personal_owner_id`),
  CONSTRAINT `fk_collection_personal_owner_id` FOREIGN KEY (`personal_owner_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Collections are an optional way to organize Cards and handle permissions for them.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `collection_bookmark`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `collection_bookmark` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT 'ID of the User who bookmarked the Collection',
  `collection_id` int NOT NULL COMMENT 'ID of the Card bookmarked by the user',
  `created_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'The timestamp of when the bookmark was created',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_collection_bookmark_user_id_collection_id` (`user_id`,`collection_id`),
  KEY `idx_collection_bookmark_user_id` (`user_id`),
  KEY `idx_collection_bookmark_collection_id` (`collection_id`),
  CONSTRAINT `fk_collection_bookmark_collection_id` FOREIGN KEY (`collection_id`) REFERENCES `collection` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_collection_bookmark_user_id` FOREIGN KEY (`user_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Table holding bookmarks on collections';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `collection_permission_graph_revision`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `collection_permission_graph_revision` (
  `id` int NOT NULL AUTO_INCREMENT,
  `before` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Serialized JSON of the collections graph before the changes.',
  `after` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Serialized JSON of the collections graph after the changes.',
  `user_id` int NOT NULL COMMENT 'The ID of the admin who made this set of changes.',
  `created_at` datetime NOT NULL COMMENT 'The timestamp of when these changes were made.',
  `remark` text COLLATE utf8mb4_unicode_ci COMMENT 'Optional remarks explaining why these changes were made.',
  PRIMARY KEY (`id`),
  KEY `fk_collection_revision_user_id` (`user_id`),
  CONSTRAINT `fk_collection_revision_user_id` FOREIGN KEY (`user_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Used to keep track of changes made to collections.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `computation_job`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `computation_job` (
  `id` int NOT NULL AUTO_INCREMENT,
  `creator_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `type` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `context` longtext COLLATE utf8mb4_unicode_ci,
  `ended_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_computation_job_ref_user_id` (`creator_id`),
  CONSTRAINT `fk_computation_job_ref_user_id` FOREIGN KEY (`creator_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stores submitted async computation jobs.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `computation_job_result`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `computation_job_result` (
  `id` int NOT NULL AUTO_INCREMENT,
  `job_id` int NOT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `permanence` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payload` longtext COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `fk_computation_result_ref_job_id` (`job_id`),
  CONSTRAINT `fk_computation_result_ref_job_id` FOREIGN KEY (`job_id`) REFERENCES `computation_job` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stores results of async computation jobs.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `core_session`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `core_session` (
  `id` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int NOT NULL,
  `created_at` datetime NOT NULL,
  `anti_csrf_token` longtext COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `fk_session_ref_user_id` (`user_id`),
  CONSTRAINT `fk_session_ref_user_id` FOREIGN KEY (`user_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `core_user`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `core_user` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `first_name` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_salt` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `date_joined` datetime NOT NULL,
  `last_login` datetime DEFAULT NULL,
  `is_superuser` bit(1) NOT NULL DEFAULT b'0',
  `is_active` bit(1) NOT NULL DEFAULT b'1',
  `reset_token` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reset_triggered` bigint DEFAULT NULL,
  `is_qbnewb` bit(1) NOT NULL DEFAULT b'1',
  `google_auth` bit(1) NOT NULL DEFAULT b'0',
  `ldap_auth` bit(1) NOT NULL DEFAULT b'0',
  `login_attributes` longtext COLLATE utf8mb4_unicode_ci,
  `updated_at` datetime DEFAULT NULL COMMENT 'When was this User last updated?',
  `sso_source` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'String to indicate the SSO backend the user is from',
  `locale` varchar(5) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Preferred ISO locale (language/country) code, e.g "en" or "en-US", for this User. Overrides site default.',
  `is_datasetnewb` bit(1) NOT NULL DEFAULT b'1' COMMENT 'Boolean flag to indicate if the dataset info modal has been dismissed.',
  `settings` longtext COLLATE utf8mb4_unicode_ci COMMENT 'Serialized JSON containing User-local Settings for this User',
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `dashboard_bookmark`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dashboard_bookmark` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT 'ID of the User who bookmarked the Dashboard',
  `dashboard_id` int NOT NULL COMMENT 'ID of the Dashboard bookmarked by the user',
  `created_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'The timestamp of when the bookmark was created',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_dashboard_bookmark_user_id_dashboard_id` (`user_id`,`dashboard_id`),
  KEY `idx_dashboard_bookmark_user_id` (`user_id`),
  KEY `idx_dashboard_bookmark_dashboard_id` (`dashboard_id`),
  CONSTRAINT `fk_dashboard_bookmark_dashboard_id` FOREIGN KEY (`dashboard_id`) REFERENCES `report_dashboard` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dashboard_bookmark_user_id` FOREIGN KEY (`user_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Table holding bookmarks on dashboards';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `dashboard_favorite`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dashboard_favorite` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT 'ID of the User who favorited the Dashboard.',
  `dashboard_id` int NOT NULL COMMENT 'ID of the Dashboard favorited by the User.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_dashboard_favorite_user_id_dashboard_id` (`user_id`,`dashboard_id`),
  KEY `idx_dashboard_favorite_user_id` (`user_id`),
  KEY `idx_dashboard_favorite_dashboard_id` (`dashboard_id`),
  CONSTRAINT `fk_dashboard_favorite_dashboard_id` FOREIGN KEY (`dashboard_id`) REFERENCES `report_dashboard` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dashboard_favorite_user_id` FOREIGN KEY (`user_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Presence of a row here indicates a given User has favorited a given Dashboard.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `dashboardcard_series`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dashboardcard_series` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dashboardcard_id` int NOT NULL,
  `card_id` int NOT NULL,
  `position` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_dashboardcard_series_dashboardcard_id` (`dashboardcard_id`),
  KEY `idx_dashboardcard_series_card_id` (`card_id`),
  CONSTRAINT `fk_dashboardcard_series_ref_card_id` FOREIGN KEY (`card_id`) REFERENCES `report_card` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dashboardcard_series_ref_dashboardcard_id` FOREIGN KEY (`dashboardcard_id`) REFERENCES `report_dashboardcard` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `data_migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `data_migrations` (
  `id` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `timestamp` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_data_migrations_id` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `dependency`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dependency` (
  `id` int NOT NULL AUTO_INCREMENT,
  `model` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_id` int NOT NULL,
  `dependent_on_model` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dependent_on_id` int NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_dependency_model` (`model`),
  KEY `idx_dependency_model_id` (`model_id`),
  KEY `idx_dependency_dependent_on_model` (`dependent_on_model`),
  KEY `idx_dependency_dependent_on_id` (`dependent_on_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `dimension`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dimension` (
  `id` int NOT NULL AUTO_INCREMENT,
  `field_id` int NOT NULL COMMENT 'ID of the field this dimension row applies to',
  `name` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Short description used as the display name of this new column',
  `type` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Either internal for a user defined remapping or external for a foreign key based remapping',
  `human_readable_field_id` int DEFAULT NULL COMMENT 'Only used with external type remappings. Indicates which field on the FK related table to use for display',
  `created_at` datetime NOT NULL COMMENT 'The timestamp of when the dimension was created.',
  `updated_at` datetime NOT NULL COMMENT 'The timestamp of when these dimension was last updated.',
  `entity_id` char(21) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Random NanoID tag for unique identity.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_dimension_field_id_name` (`field_id`,`name`),
  UNIQUE KEY `entity_id` (`entity_id`),
  KEY `fk_dimension_displayfk_ref_field_id` (`human_readable_field_id`),
  KEY `idx_dimension_field_id` (`field_id`),
  CONSTRAINT `fk_dimension_displayfk_ref_field_id` FOREIGN KEY (`human_readable_field_id`) REFERENCES `metabase_field` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dimension_ref_field_id` FOREIGN KEY (`field_id`) REFERENCES `metabase_field` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stores references to alternate views of existing fields, such as remapping an integer to a description, like an enum';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `group_table_access_policy`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `group_table_access_policy` (
  `id` int NOT NULL AUTO_INCREMENT,
  `group_id` int NOT NULL COMMENT 'ID of the Permissions Group this policy affects.',
  `table_id` int NOT NULL COMMENT 'ID of the Table that should get automatically replaced as query source for the Permissions Group.',
  `card_id` int DEFAULT NULL,
  `attribute_remappings` longtext COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_gtap_table_id_group_id` (`table_id`,`group_id`),
  KEY `fk_gtap_group_id` (`group_id`),
  KEY `idx_gtap_table_id_group_id` (`table_id`,`group_id`),
  KEY `fk_gtap_card_id` (`card_id`),
  CONSTRAINT `fk_gtap_card_id` FOREIGN KEY (`card_id`) REFERENCES `report_card` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gtap_group_id` FOREIGN KEY (`group_id`) REFERENCES `permissions_group` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gtap_table_id` FOREIGN KEY (`table_id`) REFERENCES `metabase_table` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Records that a given Card (Question) should automatically replace a given Table as query source for a given a Perms Group.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `label`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `label` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `slug` (`slug`),
  KEY `idx_label_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `login_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `login_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `timestamp` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'When this login occurred.',
  `user_id` int NOT NULL COMMENT 'ID of the User that logged in.',
  `session_id` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'ID of the Session created by this login if one is currently active. NULL if Session is no longer active.',
  `device_id` char(36) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Cookie-based unique identifier for the device/browser the user logged in from.',
  `device_description` longtext COLLATE utf8mb4_unicode_ci,
  `ip_address` longtext COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_session_id` (`session_id`),
  KEY `idx_timestamp` (`timestamp`),
  KEY `idx_user_id_device_id` (`session_id`,`device_id`),
  KEY `idx_user_id_timestamp` (`user_id`,`timestamp`),
  CONSTRAINT `fk_login_history_session_id` FOREIGN KEY (`session_id`) REFERENCES `core_session` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_login_history_user_id` FOREIGN KEY (`user_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Keeps track of various logins for different users and additional info such as location and device';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `metabase_database`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `metabase_database` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `name` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` longtext COLLATE utf8mb4_unicode_ci,
  `details` longtext COLLATE utf8mb4_unicode_ci,
  `engine` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_sample` bit(1) NOT NULL DEFAULT b'0',
  `is_full_sync` bit(1) NOT NULL DEFAULT b'1',
  `points_of_interest` longtext COLLATE utf8mb4_unicode_ci,
  `caveats` longtext COLLATE utf8mb4_unicode_ci,
  `metadata_sync_schedule` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '0 50 * * * ? *' COMMENT 'The cron schedule string for when this database should undergo the metadata sync process (and analysis for new fields).',
  `cache_field_values_schedule` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '0 50 0 * * ? *' COMMENT 'The cron schedule string for when FieldValues for eligible Fields should be updated.',
  `timezone` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Timezone identifier for the database, set by the sync process',
  `is_on_demand` bit(1) NOT NULL DEFAULT b'0' COMMENT 'Whether we should do On-Demand caching of FieldValues for this DB. This means FieldValues are updated when their Field is used in a Dashboard or Card param.',
  `options` longtext COLLATE utf8mb4_unicode_ci,
  `auto_run_queries` bit(1) NOT NULL DEFAULT b'1' COMMENT 'Whether to automatically run queries when doing simple filtering and summarizing in the Query Builder.',
  `refingerprint` bit(1) DEFAULT NULL COMMENT 'Whether or not to enable periodic refingerprinting for this Database.',
  `cache_ttl` int DEFAULT NULL COMMENT 'Granular cache TTL for specific database.',
  `initial_sync_status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'complete' COMMENT 'String indicating whether a database has completed its initial sync and is ready to use',
  `creator_id` int DEFAULT NULL COMMENT 'ID of the admin who added the database',
  `settings` longtext COLLATE utf8mb4_unicode_ci COMMENT 'Serialized JSON containing Database-local Settings for this Database',
  PRIMARY KEY (`id`),
  KEY `fk_database_creator_id` (`creator_id`),
  CONSTRAINT `fk_database_creator_id` FOREIGN KEY (`creator_id`) REFERENCES `core_user` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `metabase_field`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `metabase_field` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `name` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `base_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `semantic_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active` bit(1) NOT NULL DEFAULT b'1',
  `description` longtext COLLATE utf8mb4_unicode_ci,
  `preview_display` bit(1) NOT NULL DEFAULT b'1',
  `position` int NOT NULL DEFAULT '0',
  `table_id` int NOT NULL,
  `parent_id` int DEFAULT NULL,
  `display_name` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `visibility_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal',
  `fk_target_field_id` int DEFAULT NULL,
  `last_analyzed` datetime DEFAULT NULL,
  `points_of_interest` longtext COLLATE utf8mb4_unicode_ci,
  `caveats` longtext COLLATE utf8mb4_unicode_ci,
  `fingerprint` longtext COLLATE utf8mb4_unicode_ci,
  `fingerprint_version` int NOT NULL DEFAULT '0' COMMENT 'The version of the fingerprint for this Field. Used so we can keep track of which Fields need to be analyzed again when new things are added to fingerprints.',
  `database_type` longtext COLLATE utf8mb4_unicode_ci,
  `has_field_values` longtext COLLATE utf8mb4_unicode_ci,
  `settings` longtext COLLATE utf8mb4_unicode_ci,
  `database_position` int NOT NULL DEFAULT '0',
  `custom_position` int NOT NULL DEFAULT '0',
  `effective_type` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'The effective type of the field after any coercions.',
  `coercion_strategy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'A strategy to coerce the base_type into the effective_type.',
  `nfc_path` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Nested field column paths, flattened',
  `database_required` bit(1) NOT NULL DEFAULT b'0' COMMENT 'Indicates this field is required by the database for new records. Usually not null and without a default.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_uniq_field_table_id_parent_id_name` (`table_id`,`parent_id`,`name`),
  KEY `idx_field_table_id` (`table_id`),
  KEY `idx_field_parent_id` (`parent_id`),
  CONSTRAINT `fk_field_parent_ref_field_id` FOREIGN KEY (`parent_id`) REFERENCES `metabase_field` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_field_ref_table_id` FOREIGN KEY (`table_id`) REFERENCES `metabase_table` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `metabase_fieldvalues`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `metabase_fieldvalues` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime NOT NULL,
  `updated_at` timestamp(6) NULL DEFAULT NULL,
  `values` longtext COLLATE utf8mb4_unicode_ci,
  `human_readable_values` longtext COLLATE utf8mb4_unicode_ci,
  `field_id` int NOT NULL,
  `has_more_values` bit(1) DEFAULT b'0' COMMENT 'true if the stored values list is a subset of all possible values',
  `type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'full' COMMENT 'Type of FieldValues',
  `hash_key` longtext COLLATE utf8mb4_unicode_ci COMMENT 'Hash key for a cached fieldvalues',
  PRIMARY KEY (`id`),
  KEY `idx_fieldvalues_field_id` (`field_id`),
  CONSTRAINT `fk_fieldvalues_ref_field_id` FOREIGN KEY (`field_id`) REFERENCES `metabase_field` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `metabase_table`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `metabase_table` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `name` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` longtext COLLATE utf8mb4_unicode_ci,
  `entity_type` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `active` bit(1) NOT NULL,
  `db_id` int NOT NULL,
  `display_name` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `visibility_type` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `schema` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `points_of_interest` longtext COLLATE utf8mb4_unicode_ci,
  `caveats` longtext COLLATE utf8mb4_unicode_ci,
  `show_in_getting_started` bit(1) NOT NULL DEFAULT b'0',
  `field_order` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'database',
  `initial_sync_status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'complete' COMMENT 'String indicating whether a table has completed its initial sync and is ready to use',
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_uniq_table_db_id_schema_name` (`db_id`,`schema`,`name`),
  KEY `idx_table_db_id` (`db_id`),
  KEY `idx_metabase_table_show_in_getting_started` (`show_in_getting_started`),
  KEY `idx_metabase_table_db_id_schema` (`db_id`,`schema`),
  CONSTRAINT `fk_table_ref_database_id` FOREIGN KEY (`db_id`) REFERENCES `metabase_database` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `metric`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `metric` (
  `id` int NOT NULL AUTO_INCREMENT,
  `table_id` int NOT NULL,
  `creator_id` int NOT NULL,
  `name` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` longtext COLLATE utf8mb4_unicode_ci,
  `archived` bit(1) DEFAULT b'0',
  `definition` longtext COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `points_of_interest` longtext COLLATE utf8mb4_unicode_ci,
  `caveats` longtext COLLATE utf8mb4_unicode_ci,
  `how_is_this_calculated` longtext COLLATE utf8mb4_unicode_ci,
  `show_in_getting_started` bit(1) NOT NULL DEFAULT b'0',
  `entity_id` char(21) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Random NanoID tag for unique identity.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `entity_id` (`entity_id`),
  KEY `idx_metric_creator_id` (`creator_id`),
  KEY `idx_metric_table_id` (`table_id`),
  KEY `idx_metric_show_in_getting_started` (`show_in_getting_started`),
  CONSTRAINT `fk_metric_ref_creator_id` FOREIGN KEY (`creator_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_metric_ref_table_id` FOREIGN KEY (`table_id`) REFERENCES `metabase_table` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `metric_important_field`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `metric_important_field` (
  `id` int NOT NULL AUTO_INCREMENT,
  `metric_id` int NOT NULL,
  `field_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_metric_important_field_metric_id_field_id` (`metric_id`,`field_id`),
  KEY `idx_metric_important_field_metric_id` (`metric_id`),
  KEY `idx_metric_important_field_field_id` (`field_id`),
  CONSTRAINT `fk_metric_important_field_metabase_field_id` FOREIGN KEY (`field_id`) REFERENCES `metabase_field` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_metric_important_field_metric_id` FOREIGN KEY (`metric_id`) REFERENCES `metric` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `moderation_review`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `moderation_review` (
  `id` int NOT NULL AUTO_INCREMENT,
  `updated_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'most recent modification time',
  `created_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'creation time',
  `status` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'verified, misleading, confusing, not_misleading, pending',
  `text` longtext COLLATE utf8mb4_unicode_ci,
  `moderated_item_id` int NOT NULL COMMENT 'either a document or question ID; the item that needs review',
  `moderated_item_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'whether it''s a question or dashboard',
  `moderator_id` int NOT NULL COMMENT 'ID of the user who did the review',
  `most_recent` bit(1) NOT NULL COMMENT 'tag for most recent review',
  PRIMARY KEY (`id`),
  KEY `idx_moderation_review_item_type_item_id` (`moderated_item_type`,`moderated_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Reviews (from moderators) for a given question/dashboard (BUCM)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `native_query_snippet`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `native_query_snippet` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Name of the query snippet',
  `description` longtext COLLATE utf8mb4_unicode_ci,
  `content` longtext COLLATE utf8mb4_unicode_ci,
  `creator_id` int NOT NULL,
  `archived` bit(1) NOT NULL DEFAULT b'0',
  `created_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `collection_id` int DEFAULT NULL COMMENT 'ID of the Snippet Folder (Collection) this Snippet is in, if any',
  `entity_id` char(21) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Random NanoID tag for unique identity.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`),
  UNIQUE KEY `entity_id` (`entity_id`),
  KEY `fk_snippet_creator_id` (`creator_id`),
  KEY `idx_snippet_name` (`name`),
  KEY `idx_snippet_collection_id` (`collection_id`),
  CONSTRAINT `fk_snippet_collection_id` FOREIGN KEY (`collection_id`) REFERENCES `collection` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_snippet_creator_id` FOREIGN KEY (`creator_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Query snippets (raw text) to be substituted in native queries';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `object` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `group_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `group_id` (`group_id`,`object`),
  KEY `idx_permissions_group_id` (`group_id`),
  KEY `idx_permissions_object` (`object`),
  KEY `idx_permissions_group_id_object` (`group_id`,`object`),
  CONSTRAINT `fk_permissions_group_id` FOREIGN KEY (`group_id`) REFERENCES `permissions_group` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permissions_group`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions_group` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_permissions_group_name` (`name`),
  KEY `idx_permissions_group_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permissions_group_membership`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions_group_membership` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `group_id` int NOT NULL,
  `is_group_manager` bit(1) NOT NULL DEFAULT b'0' COMMENT 'Boolean flag to indicate whether user is a group''s manager.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_permissions_group_membership_user_id_group_id` (`user_id`,`group_id`),
  KEY `idx_permissions_group_membership_group_id` (`group_id`),
  KEY `idx_permissions_group_membership_user_id` (`user_id`),
  KEY `idx_permissions_group_membership_group_id_user_id` (`group_id`,`user_id`),
  CONSTRAINT `fk_permissions_group_group_id` FOREIGN KEY (`group_id`) REFERENCES `permissions_group` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_permissions_group_membership_user_id` FOREIGN KEY (`user_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `permissions_revision`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions_revision` (
  `id` int NOT NULL AUTO_INCREMENT,
  `before` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Serialized JSON of the permissions before the changes.',
  `after` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Serialized JSON of the permissions after the changes.',
  `user_id` int NOT NULL COMMENT 'The ID of the admin who made this set of changes.',
  `created_at` datetime NOT NULL COMMENT 'The timestamp of when these changes were made.',
  `remark` text COLLATE utf8mb4_unicode_ci COMMENT 'Optional remarks explaining why these changes were made.',
  PRIMARY KEY (`id`),
  KEY `fk_permissions_revision_user_id` (`user_id`),
  CONSTRAINT `fk_permissions_revision_user_id` FOREIGN KEY (`user_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Used to keep track of changes made to permissions.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `persisted_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `persisted_info` (
  `id` int NOT NULL AUTO_INCREMENT,
  `database_id` int NOT NULL COMMENT 'ID of the database associated to the persisted card',
  `card_id` int NOT NULL COMMENT 'ID of the Card model persisted',
  `question_slug` longtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Slug of the card which will form the persisted table name',
  `table_name` longtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Name of the table persisted',
  `definition` longtext COLLATE utf8mb4_unicode_ci COMMENT 'JSON object that captures the state of the table when we persisted',
  `query_hash` longtext COLLATE utf8mb4_unicode_ci COMMENT 'Hash of the query persisted',
  `active` bit(1) NOT NULL DEFAULT b'0' COMMENT 'Indicating whether the persisted table is active and can be swapped',
  `state` longtext COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Persisted table state (creating, persisted, refreshing, deleted)',
  `refresh_begin` timestamp(6) NOT NULL COMMENT 'The timestamp of when the most recent refresh was started',
  `refresh_end` timestamp(6) NULL DEFAULT NULL COMMENT 'The timestamp of when the most recent refresh ended',
  `state_change_at` timestamp(6) NULL DEFAULT NULL COMMENT 'The timestamp of when the most recent state changed',
  `error` longtext COLLATE utf8mb4_unicode_ci COMMENT 'Error message from persisting if applicable',
  `created_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'The timestamp of when the model was first persisted',
  `creator_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `card_id` (`card_id`),
  KEY `fk_persisted_info_database_id` (`database_id`),
  KEY `fk_persisted_info_ref_creator_id` (`creator_id`),
  CONSTRAINT `fk_persisted_info_card_id` FOREIGN KEY (`card_id`) REFERENCES `report_card` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_persisted_info_database_id` FOREIGN KEY (`database_id`) REFERENCES `metabase_database` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_persisted_info_ref_creator_id` FOREIGN KEY (`creator_id`) REFERENCES `core_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Table holding information about persisted models';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pulse`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pulse` (
  `id` int NOT NULL AUTO_INCREMENT,
  `creator_id` int NOT NULL,
  `name` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `skip_if_empty` bit(1) NOT NULL DEFAULT b'0' COMMENT 'Skip a scheduled Pulse if none of its questions have any results',
  `alert_condition` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Condition (i.e. "rows" or "goal") used as a guard for alerts',
  `alert_first_only` bit(1) DEFAULT NULL COMMENT 'True if the alert should be disabled after the first notification',
  `alert_above_goal` bit(1) DEFAULT NULL COMMENT 'For a goal condition, alert when above the goal',
  `collection_id` int DEFAULT NULL COMMENT 'Options ID of Collection this Pulse belongs to.',
  `collection_position` smallint DEFAULT NULL COMMENT 'Optional pinned position for this item in its Collection. NULL means item is not pinned.',
  `archived` bit(1) DEFAULT b'0' COMMENT 'Has this pulse been archived?',
  `dashboard_id` int DEFAULT NULL COMMENT 'ID of the Dashboard if this Pulse is a Dashboard Subscription.',
  `parameters` longtext COLLATE utf8mb4_unicode_ci,
  `entity_id` char(21) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Random NanoID tag for unique identity.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `entity_id` (`entity_id`),
  KEY `idx_pulse_creator_id` (`creator_id`),
  KEY `idx_pulse_collection_id` (`collection_id`),
  KEY `fk_pulse_ref_dashboard_id` (`dashboard_id`),
  CONSTRAINT `fk_pulse_collection_id` FOREIGN KEY (`collection_id`) REFERENCES `collection` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_pulse_ref_creator_id` FOREIGN KEY (`creator_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pulse_ref_dashboard_id` FOREIGN KEY (`dashboard_id`) REFERENCES `report_dashboard` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pulse_card`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pulse_card` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pulse_id` int NOT NULL,
  `card_id` int NOT NULL,
  `position` int NOT NULL,
  `include_csv` bit(1) NOT NULL DEFAULT b'0' COMMENT 'True if a CSV of the data should be included for this pulse card',
  `include_xls` bit(1) NOT NULL DEFAULT b'0' COMMENT 'True if a XLS of the data should be included for this pulse card',
  `dashboard_card_id` int DEFAULT NULL COMMENT 'If this Pulse is a Dashboard subscription, the ID of the DashboardCard that corresponds to this PulseCard.',
  `entity_id` char(21) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Random NanoID tag for unique identity.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `entity_id` (`entity_id`),
  KEY `idx_pulse_card_pulse_id` (`pulse_id`),
  KEY `idx_pulse_card_card_id` (`card_id`),
  KEY `fk_pulse_card_ref_pulse_card_id` (`dashboard_card_id`),
  CONSTRAINT `fk_pulse_card_ref_card_id` FOREIGN KEY (`card_id`) REFERENCES `report_card` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pulse_card_ref_pulse_card_id` FOREIGN KEY (`dashboard_card_id`) REFERENCES `report_dashboardcard` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pulse_card_ref_pulse_id` FOREIGN KEY (`pulse_id`) REFERENCES `pulse` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pulse_channel`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pulse_channel` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pulse_id` int NOT NULL,
  `channel_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `details` longtext COLLATE utf8mb4_unicode_ci,
  `schedule_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `schedule_hour` int DEFAULT NULL,
  `schedule_day` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `schedule_frame` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `enabled` bit(1) NOT NULL DEFAULT b'1',
  `entity_id` char(21) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Random NanoID tag for unique identity.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `entity_id` (`entity_id`),
  KEY `idx_pulse_channel_pulse_id` (`pulse_id`),
  KEY `idx_pulse_channel_schedule_type` (`schedule_type`),
  CONSTRAINT `fk_pulse_channel_ref_pulse_id` FOREIGN KEY (`pulse_id`) REFERENCES `pulse` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `pulse_channel_recipient`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `pulse_channel_recipient` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pulse_channel_id` int NOT NULL,
  `user_id` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_pulse_channel_recipient_ref_pulse_channel_id` (`pulse_channel_id`),
  KEY `fk_pulse_channel_recipient_ref_user_id` (`user_id`),
  CONSTRAINT `fk_pulse_channel_recipient_ref_pulse_channel_id` FOREIGN KEY (`pulse_channel_id`) REFERENCES `pulse_channel` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pulse_channel_recipient_ref_user_id` FOREIGN KEY (`user_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `QRTZ_BLOB_TRIGGERS`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `QRTZ_BLOB_TRIGGERS` (
  `SCHED_NAME` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `TRIGGER_NAME` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `TRIGGER_GROUP` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `BLOB_DATA` blob,
  PRIMARY KEY (`SCHED_NAME`,`TRIGGER_NAME`,`TRIGGER_GROUP`),
  CONSTRAINT `FK_QRTZ_BLOB_TRIGGERS_TRIGGERS` FOREIGN KEY (`SCHED_NAME`, `TRIGGER_NAME`, `TRIGGER_GROUP`) REFERENCES `QRTZ_TRIGGERS` (`SCHED_NAME`, `TRIGGER_NAME`, `TRIGGER_GROUP`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Used for Quartz scheduler.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `QRTZ_CALENDARS`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `QRTZ_CALENDARS` (
  `SCHED_NAME` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `CALENDAR_NAME` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `CALENDAR` blob NOT NULL,
  PRIMARY KEY (`SCHED_NAME`,`CALENDAR_NAME`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Used for Quartz scheduler.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `QRTZ_CRON_TRIGGERS`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `QRTZ_CRON_TRIGGERS` (
  `SCHED_NAME` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `TRIGGER_NAME` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `TRIGGER_GROUP` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `CRON_EXPRESSION` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `TIME_ZONE_ID` varchar(80) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`SCHED_NAME`,`TRIGGER_NAME`,`TRIGGER_GROUP`),
  CONSTRAINT `FK_QRTZ_CRON_TRIGGERS_TRIGGERS` FOREIGN KEY (`SCHED_NAME`, `TRIGGER_NAME`, `TRIGGER_GROUP`) REFERENCES `QRTZ_TRIGGERS` (`SCHED_NAME`, `TRIGGER_NAME`, `TRIGGER_GROUP`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Used for Quartz scheduler.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `QRTZ_FIRED_TRIGGERS`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `QRTZ_FIRED_TRIGGERS` (
  `SCHED_NAME` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ENTRY_ID` varchar(95) COLLATE utf8mb4_unicode_ci NOT NULL,
  `TRIGGER_NAME` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `TRIGGER_GROUP` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `INSTANCE_NAME` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `FIRED_TIME` bigint NOT NULL,
  `SCHED_TIME` bigint DEFAULT NULL,
  `PRIORITY` int NOT NULL,
  `STATE` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `JOB_NAME` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `JOB_GROUP` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `IS_NONCONCURRENT` bit(1) DEFAULT NULL,
  `REQUESTS_RECOVERY` bit(1) DEFAULT NULL,
  PRIMARY KEY (`SCHED_NAME`,`ENTRY_ID`),
  KEY `IDX_QRTZ_FT_TRIG_INST_NAME` (`SCHED_NAME`,`INSTANCE_NAME`),
  KEY `IDX_QRTZ_FT_INST_JOB_REQ_RCVRY` (`SCHED_NAME`,`INSTANCE_NAME`,`REQUESTS_RECOVERY`),
  KEY `IDX_QRTZ_FT_J_G` (`SCHED_NAME`,`JOB_NAME`,`JOB_GROUP`),
  KEY `IDX_QRTZ_FT_JG` (`SCHED_NAME`,`JOB_GROUP`),
  KEY `IDX_QRTZ_FT_T_G` (`SCHED_NAME`,`TRIGGER_NAME`,`TRIGGER_GROUP`),
  KEY `IDX_QRTZ_FT_TG` (`SCHED_NAME`,`TRIGGER_GROUP`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Used for Quartz scheduler.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `QRTZ_JOB_DETAILS`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `QRTZ_JOB_DETAILS` (
  `SCHED_NAME` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `JOB_NAME` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `JOB_GROUP` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `DESCRIPTION` varchar(250) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `JOB_CLASS_NAME` varchar(250) COLLATE utf8mb4_unicode_ci NOT NULL,
  `IS_DURABLE` bit(1) NOT NULL,
  `IS_NONCONCURRENT` bit(1) NOT NULL,
  `IS_UPDATE_DATA` bit(1) NOT NULL,
  `REQUESTS_RECOVERY` bit(1) NOT NULL,
  `JOB_DATA` blob,
  PRIMARY KEY (`SCHED_NAME`,`JOB_NAME`,`JOB_GROUP`),
  KEY `IDX_QRTZ_J_REQ_RECOVERY` (`SCHED_NAME`,`REQUESTS_RECOVERY`),
  KEY `IDX_QRTZ_J_GRP` (`SCHED_NAME`,`JOB_GROUP`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Used for Quartz scheduler.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `QRTZ_LOCKS`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `QRTZ_LOCKS` (
  `SCHED_NAME` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `LOCK_NAME` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`SCHED_NAME`,`LOCK_NAME`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Used for Quartz scheduler.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `QRTZ_PAUSED_TRIGGER_GRPS`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `QRTZ_PAUSED_TRIGGER_GRPS` (
  `SCHED_NAME` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `TRIGGER_GROUP` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  PRIMARY KEY (`SCHED_NAME`,`TRIGGER_GROUP`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Used for Quartz scheduler.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `QRTZ_SCHEDULER_STATE`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `QRTZ_SCHEDULER_STATE` (
  `SCHED_NAME` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `INSTANCE_NAME` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `LAST_CHECKIN_TIME` bigint NOT NULL,
  `CHECKIN_INTERVAL` bigint NOT NULL,
  PRIMARY KEY (`SCHED_NAME`,`INSTANCE_NAME`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Used for Quartz scheduler.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `QRTZ_SIMPLE_TRIGGERS`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `QRTZ_SIMPLE_TRIGGERS` (
  `SCHED_NAME` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `TRIGGER_NAME` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `TRIGGER_GROUP` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `REPEAT_COUNT` bigint NOT NULL,
  `REPEAT_INTERVAL` bigint NOT NULL,
  `TIMES_TRIGGERED` bigint NOT NULL,
  PRIMARY KEY (`SCHED_NAME`,`TRIGGER_NAME`,`TRIGGER_GROUP`),
  CONSTRAINT `FK_QRTZ_SIMPLE_TRIGGERS_TRIGGERS` FOREIGN KEY (`SCHED_NAME`, `TRIGGER_NAME`, `TRIGGER_GROUP`) REFERENCES `QRTZ_TRIGGERS` (`SCHED_NAME`, `TRIGGER_NAME`, `TRIGGER_GROUP`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Used for Quartz scheduler.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `QRTZ_SIMPROP_TRIGGERS`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `QRTZ_SIMPROP_TRIGGERS` (
  `SCHED_NAME` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `TRIGGER_NAME` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `TRIGGER_GROUP` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `STR_PROP_1` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `STR_PROP_2` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `STR_PROP_3` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `INT_PROP_1` int DEFAULT NULL,
  `INT_PROP_2` int DEFAULT NULL,
  `LONG_PROP_1` bigint DEFAULT NULL,
  `LONG_PROP_2` bigint DEFAULT NULL,
  `DEC_PROP_1` decimal(13,4) DEFAULT NULL,
  `DEC_PROP_2` decimal(13,4) DEFAULT NULL,
  `BOOL_PROP_1` bit(1) DEFAULT NULL,
  `BOOL_PROP_2` bit(1) DEFAULT NULL,
  PRIMARY KEY (`SCHED_NAME`,`TRIGGER_NAME`,`TRIGGER_GROUP`),
  CONSTRAINT `FK_QRTZ_SIMPROP_TRIGGERS_TRIGGERS` FOREIGN KEY (`SCHED_NAME`, `TRIGGER_NAME`, `TRIGGER_GROUP`) REFERENCES `QRTZ_TRIGGERS` (`SCHED_NAME`, `TRIGGER_NAME`, `TRIGGER_GROUP`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Used for Quartz scheduler.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `QRTZ_TRIGGERS`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `QRTZ_TRIGGERS` (
  `SCHED_NAME` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `TRIGGER_NAME` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `TRIGGER_GROUP` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `JOB_NAME` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `JOB_GROUP` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `DESCRIPTION` varchar(250) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `NEXT_FIRE_TIME` bigint DEFAULT NULL,
  `PREV_FIRE_TIME` bigint DEFAULT NULL,
  `PRIORITY` int DEFAULT NULL,
  `TRIGGER_STATE` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `TRIGGER_TYPE` varchar(8) COLLATE utf8mb4_unicode_ci NOT NULL,
  `START_TIME` bigint NOT NULL,
  `END_TIME` bigint DEFAULT NULL,
  `CALENDAR_NAME` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `MISFIRE_INSTR` smallint DEFAULT NULL,
  `JOB_DATA` blob,
  PRIMARY KEY (`SCHED_NAME`,`TRIGGER_NAME`,`TRIGGER_GROUP`),
  KEY `IDX_QRTZ_T_J` (`SCHED_NAME`,`JOB_NAME`,`JOB_GROUP`),
  KEY `IDX_QRTZ_T_JG` (`SCHED_NAME`,`JOB_GROUP`),
  KEY `IDX_QRTZ_T_C` (`SCHED_NAME`,`CALENDAR_NAME`),
  KEY `IDX_QRTZ_T_G` (`SCHED_NAME`,`TRIGGER_GROUP`),
  KEY `IDX_QRTZ_T_STATE` (`SCHED_NAME`,`TRIGGER_STATE`),
  KEY `IDX_QRTZ_T_N_STATE` (`SCHED_NAME`,`TRIGGER_NAME`,`TRIGGER_GROUP`,`TRIGGER_STATE`),
  KEY `IDX_QRTZ_T_N_G_STATE` (`SCHED_NAME`,`TRIGGER_GROUP`,`TRIGGER_STATE`),
  KEY `IDX_QRTZ_T_NEXT_FIRE_TIME` (`SCHED_NAME`,`NEXT_FIRE_TIME`),
  KEY `IDX_QRTZ_T_NFT_ST` (`SCHED_NAME`,`TRIGGER_STATE`,`NEXT_FIRE_TIME`),
  KEY `IDX_QRTZ_T_NFT_MISFIRE` (`SCHED_NAME`,`MISFIRE_INSTR`,`NEXT_FIRE_TIME`),
  KEY `IDX_QRTZ_T_NFT_ST_MISFIRE` (`SCHED_NAME`,`MISFIRE_INSTR`,`NEXT_FIRE_TIME`,`TRIGGER_STATE`),
  KEY `IDX_QRTZ_T_NFT_ST_MISFIRE_GRP` (`SCHED_NAME`,`MISFIRE_INSTR`,`NEXT_FIRE_TIME`,`TRIGGER_GROUP`,`TRIGGER_STATE`),
  CONSTRAINT `FK_QRTZ_TRIGGERS_JOB_DETAILS` FOREIGN KEY (`SCHED_NAME`, `JOB_NAME`, `JOB_GROUP`) REFERENCES `QRTZ_JOB_DETAILS` (`SCHED_NAME`, `JOB_NAME`, `JOB_GROUP`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Used for Quartz scheduler.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `query`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `query` (
  `query_hash` binary(32) NOT NULL COMMENT 'The hash of the query dictionary. (This is a 256-bit SHA3 hash of the query dict.)',
  `average_execution_time` int NOT NULL COMMENT 'Average execution time for the query, round to nearest number of milliseconds. This is updated as a rolling average.',
  `query` longtext COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`query_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Information (such as average execution time) for different queries that have been previously ran.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `query_cache`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `query_cache` (
  `query_hash` binary(32) NOT NULL COMMENT 'The hash of the query dictionary. (This is a 256-bit SHA3 hash of the query dict).',
  `updated_at` timestamp(6) NULL DEFAULT NULL,
  `results` longblob,
  PRIMARY KEY (`query_hash`),
  KEY `idx_query_cache_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Cached results of queries are stored here when using the DB-based query cache.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `query_execution`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `query_execution` (
  `id` int NOT NULL AUTO_INCREMENT,
  `hash` binary(32) NOT NULL COMMENT 'The hash of the query dictionary. This is a 256-bit SHA3 hash of the query.',
  `started_at` timestamp(6) NULL DEFAULT NULL,
  `running_time` int NOT NULL COMMENT 'The time, in milliseconds, this query took to complete.',
  `result_rows` int NOT NULL COMMENT 'Number of rows in the query results.',
  `native` bit(1) NOT NULL COMMENT 'Whether the query was a native query, as opposed to an MBQL one (e.g., created with the GUI).',
  `context` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Short string specifying how this query was executed, e.g. in a Dashboard or Pulse.',
  `error` longtext COLLATE utf8mb4_unicode_ci,
  `executor_id` int DEFAULT NULL COMMENT 'The ID of the User who triggered this query execution, if any.',
  `card_id` int DEFAULT NULL COMMENT 'The ID of the Card (Question) associated with this query execution, if any.',
  `dashboard_id` int DEFAULT NULL COMMENT 'The ID of the Dashboard associated with this query execution, if any.',
  `pulse_id` int DEFAULT NULL COMMENT 'The ID of the Pulse associated with this query execution, if any.',
  `database_id` int DEFAULT NULL COMMENT 'ID of the database this query was ran against.',
  `cache_hit` bit(1) DEFAULT NULL COMMENT 'Cache hit on query execution',
  PRIMARY KEY (`id`),
  KEY `idx_query_execution_started_at` (`started_at`),
  KEY `idx_query_execution_query_hash_started_at` (`hash`,`started_at`),
  KEY `idx_query_execution_card_id` (`card_id`),
  KEY `idx_query_execution_card_id_started_at` (`card_id`,`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='A log of executed queries, used for calculating historic execution times, auditing, and other purposes.';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `report_card`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_card` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `name` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` longtext COLLATE utf8mb4_unicode_ci,
  `display` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dataset_query` longtext COLLATE utf8mb4_unicode_ci,
  `visualization_settings` longtext COLLATE utf8mb4_unicode_ci,
  `creator_id` int NOT NULL,
  `database_id` int NOT NULL,
  `table_id` int DEFAULT NULL,
  `query_type` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `archived` bit(1) NOT NULL DEFAULT b'0',
  `collection_id` int DEFAULT NULL COMMENT 'Optional ID of Collection this Card belongs to.',
  `public_uuid` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Unique UUID used to in publically-accessible links to this Card.',
  `made_public_by_id` int DEFAULT NULL COMMENT 'The ID of the User who first publically shared this Card.',
  `enable_embedding` bit(1) NOT NULL DEFAULT b'0' COMMENT 'Is this Card allowed to be embedded in different websites (using a signed JWT)?',
  `embedding_params` longtext COLLATE utf8mb4_unicode_ci,
  `cache_ttl` int DEFAULT NULL COMMENT 'The maximum time, in seconds, to return cached results for this Card rather than running a new query.',
  `result_metadata` longtext COLLATE utf8mb4_unicode_ci,
  `collection_position` smallint DEFAULT NULL COMMENT 'Optional pinned position for this item in its Collection. NULL means item is not pinned.',
  `dataset` bit(1) NOT NULL DEFAULT b'0' COMMENT 'Indicate whether question is a dataset',
  `entity_id` char(21) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Random NanoID tag for unique identity.',
  `parameters` longtext COLLATE utf8mb4_unicode_ci COMMENT 'List of parameter associated to a card',
  `parameter_mappings` longtext COLLATE utf8mb4_unicode_ci COMMENT 'List of parameter associated to a card',
  `collection_preview` bit(1) NOT NULL DEFAULT b'1' COMMENT 'Indicating whether the card should be visualized in the collection preview',
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_uuid` (`public_uuid`),
  UNIQUE KEY `entity_id` (`entity_id`),
  KEY `idx_card_creator_id` (`creator_id`),
  KEY `idx_card_collection_id` (`collection_id`),
  KEY `idx_card_public_uuid` (`public_uuid`),
  KEY `fk_card_made_public_by_id` (`made_public_by_id`),
  KEY `fk_report_card_ref_database_id` (`database_id`),
  KEY `fk_report_card_ref_table_id` (`table_id`),
  CONSTRAINT `fk_card_collection_id` FOREIGN KEY (`collection_id`) REFERENCES `collection` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_card_made_public_by_id` FOREIGN KEY (`made_public_by_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_card_ref_user_id` FOREIGN KEY (`creator_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_report_card_ref_database_id` FOREIGN KEY (`database_id`) REFERENCES `metabase_database` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_report_card_ref_table_id` FOREIGN KEY (`table_id`) REFERENCES `metabase_table` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `report_cardfavorite`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_cardfavorite` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `card_id` int NOT NULL,
  `owner_id` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_unique_cardfavorite_card_id_owner_id` (`card_id`,`owner_id`),
  KEY `idx_cardfavorite_card_id` (`card_id`),
  KEY `idx_cardfavorite_owner_id` (`owner_id`),
  CONSTRAINT `fk_cardfavorite_ref_card_id` FOREIGN KEY (`card_id`) REFERENCES `report_card` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_cardfavorite_ref_user_id` FOREIGN KEY (`owner_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `report_dashboard`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_dashboard` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `name` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` longtext COLLATE utf8mb4_unicode_ci,
  `creator_id` int NOT NULL,
  `parameters` longtext COLLATE utf8mb4_unicode_ci,
  `points_of_interest` longtext COLLATE utf8mb4_unicode_ci,
  `caveats` longtext COLLATE utf8mb4_unicode_ci,
  `show_in_getting_started` bit(1) NOT NULL DEFAULT b'0',
  `public_uuid` char(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Unique UUID used to in publically-accessible links to this Dashboard.',
  `made_public_by_id` int DEFAULT NULL COMMENT 'The ID of the User who first publically shared this Dashboard.',
  `enable_embedding` bit(1) NOT NULL DEFAULT b'0' COMMENT 'Is this Dashboard allowed to be embedded in different websites (using a signed JWT)?',
  `embedding_params` longtext COLLATE utf8mb4_unicode_ci,
  `archived` bit(1) NOT NULL DEFAULT b'0' COMMENT 'Is this Dashboard archived (effectively treated as deleted?)',
  `position` int DEFAULT NULL COMMENT 'The position this Dashboard should appear in the Dashboards list, lower-numbered positions appearing before higher numbered ones.',
  `collection_id` int DEFAULT NULL COMMENT 'Optional ID of Collection this Dashboard belongs to.',
  `collection_position` smallint DEFAULT NULL COMMENT 'Optional pinned position for this item in its Collection. NULL means item is not pinned.',
  `cache_ttl` int DEFAULT NULL COMMENT 'Granular cache TTL for specific dashboard.',
  `entity_id` char(21) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Random NanoID tag for unique identity.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `public_uuid` (`public_uuid`),
  UNIQUE KEY `entity_id` (`entity_id`),
  KEY `idx_dashboard_creator_id` (`creator_id`),
  KEY `idx_report_dashboard_show_in_getting_started` (`show_in_getting_started`),
  KEY `idx_dashboard_public_uuid` (`public_uuid`),
  KEY `idx_dashboard_collection_id` (`collection_id`),
  KEY `fk_dashboard_made_public_by_id` (`made_public_by_id`),
  CONSTRAINT `fk_dashboard_collection_id` FOREIGN KEY (`collection_id`) REFERENCES `collection` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_dashboard_made_public_by_id` FOREIGN KEY (`made_public_by_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dashboard_ref_user_id` FOREIGN KEY (`creator_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `report_dashboardcard`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_dashboardcard` (
  `id` int NOT NULL AUTO_INCREMENT,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `sizeX` int NOT NULL,
  `sizeY` int NOT NULL,
  `row` int NOT NULL DEFAULT '0',
  `col` int NOT NULL DEFAULT '0',
  `card_id` int DEFAULT NULL,
  `dashboard_id` int NOT NULL,
  `parameter_mappings` longtext COLLATE utf8mb4_unicode_ci,
  `visualization_settings` longtext COLLATE utf8mb4_unicode_ci,
  `entity_id` char(21) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Random NanoID tag for unique identity.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `entity_id` (`entity_id`),
  KEY `idx_dashboardcard_card_id` (`card_id`),
  KEY `idx_dashboardcard_dashboard_id` (`dashboard_id`),
  CONSTRAINT `fk_dashboardcard_ref_card_id` FOREIGN KEY (`card_id`) REFERENCES `report_card` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_dashboardcard_ref_dashboard_id` FOREIGN KEY (`dashboard_id`) REFERENCES `report_dashboard` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `revision`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `revision` (
  `id` int NOT NULL AUTO_INCREMENT,
  `model` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_id` int NOT NULL,
  `user_id` int NOT NULL,
  `timestamp` timestamp(6) NULL DEFAULT NULL,
  `object` longtext COLLATE utf8mb4_unicode_ci,
  `is_reversion` bit(1) NOT NULL DEFAULT b'0',
  `is_creation` bit(1) NOT NULL DEFAULT b'0',
  `message` longtext COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_revision_model_model_id` (`model`,`model_id`),
  KEY `fk_revision_ref_user_id` (`user_id`),
  CONSTRAINT `fk_revision_ref_user_id` FOREIGN KEY (`user_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `secret`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `secret` (
  `id` int NOT NULL AUTO_INCREMENT COMMENT 'Part of composite primary key for secret; this is the uniquely generted ID column',
  `version` int NOT NULL DEFAULT '1' COMMENT 'Part of composite primary key for secret; this is the version column',
  `creator_id` int DEFAULT NULL COMMENT 'User ID who created this secret instance',
  `created_at` timestamp(6) NOT NULL COMMENT 'Timestamp for when this secret instance was created',
  `updated_at` timestamp(6) NULL DEFAULT NULL COMMENT 'Timestamp for when this secret record was updated. Only relevant when non-value field changes since a value change will result in a new version being inserted.',
  `name` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'The name of this secret record.',
  `kind` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'The kind of secret this record represents; the value is interpreted as a Clojure keyword with a hierarchy. Ex: ''bytes'' means generic binary data, ''jks-keystore'' extends ''bytes'' but has a specific meaning.',
  `source` varchar(254) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'The source of secret record, which controls how Metabase interprets the value (ex: ''file-path'' means the ''simple_value'' is not the real value, but a pointer to a file that contains the value).',
  `value` blob NOT NULL COMMENT 'The base64 encoded binary value of this secret record. If encryption is enabled, this will be the output of the encryption procedure on the plaintext. If not, it will be the base64 encoded plaintext.',
  PRIMARY KEY (`id`,`version`),
  KEY `fk_secret_ref_user_id` (`creator_id`),
  CONSTRAINT `fk_secret_ref_user_id` FOREIGN KEY (`creator_id`) REFERENCES `core_user` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Storage for managed secrets (passwords, binary data, etc.)';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `segment`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `segment` (
  `id` int NOT NULL AUTO_INCREMENT,
  `table_id` int NOT NULL,
  `creator_id` int NOT NULL,
  `name` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` longtext COLLATE utf8mb4_unicode_ci,
  `archived` bit(1) DEFAULT b'0',
  `definition` longtext COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  `points_of_interest` longtext COLLATE utf8mb4_unicode_ci,
  `caveats` longtext COLLATE utf8mb4_unicode_ci,
  `show_in_getting_started` bit(1) NOT NULL DEFAULT b'0',
  `entity_id` char(21) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Random NanoID tag for unique identity.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `entity_id` (`entity_id`),
  KEY `idx_segment_creator_id` (`creator_id`),
  KEY `idx_segment_table_id` (`table_id`),
  KEY `idx_segment_show_in_getting_started` (`show_in_getting_started`),
  CONSTRAINT `fk_segment_ref_creator_id` FOREIGN KEY (`creator_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_segment_ref_table_id` FOREIGN KEY (`table_id`) REFERENCES `metabase_table` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `setting`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `setting` (
  `key` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` longtext COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `task_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `task_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `task` varchar(254) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Name of the task',
  `db_id` int DEFAULT NULL,
  `started_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `ended_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `duration` int NOT NULL,
  `task_details` longtext COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_task_history_end_time` (`ended_at`),
  KEY `idx_task_history_db_id` (`db_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Timing and metadata info about background/quartz processes';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `timeline`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `timeline` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Name of the timeline',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Optional description of the timeline',
  `icon` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `collection_id` int DEFAULT NULL COMMENT 'ID of the collection containing the timeline',
  `archived` bit(1) NOT NULL DEFAULT b'0' COMMENT 'Whether or not the timeline has been archived',
  `creator_id` int NOT NULL COMMENT 'ID of the user who created the timeline',
  `created_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'The timestamp of when the timeline was created',
  `updated_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'The timestamp of when the timeline was updated',
  `default` bit(1) NOT NULL DEFAULT b'0' COMMENT 'Boolean value indicating if the timeline is the default one for the containing Collection',
  `entity_id` char(21) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Random NanoID tag for unique identity.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `entity_id` (`entity_id`),
  KEY `fk_timeline_creator_id` (`creator_id`),
  KEY `idx_timeline_collection_id` (`collection_id`),
  CONSTRAINT `fk_timeline_collection_id` FOREIGN KEY (`collection_id`) REFERENCES `collection` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_timeline_creator_id` FOREIGN KEY (`creator_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Timeline table to organize events';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `timeline_event`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `timeline_event` (
  `id` int NOT NULL AUTO_INCREMENT,
  `timeline_id` int NOT NULL COMMENT 'ID of the timeline containing the event',
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Name of the event',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Optional markdown description of the event',
  `timestamp` timestamp(6) NOT NULL COMMENT 'When the event happened',
  `time_matters` bit(1) NOT NULL COMMENT 'Indicate whether the time component matters or if the timestamp should just serve to indicate the day of the event without any time associated to it.',
  `timezone` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Timezone to display the underlying UTC timestamp in for the client',
  `icon` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `archived` bit(1) NOT NULL DEFAULT b'0' COMMENT 'Whether or not the event has been archived',
  `creator_id` int NOT NULL COMMENT 'ID of the user who created the event',
  `created_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'The timestamp of when the event was created',
  `updated_at` timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) COMMENT 'The timestamp of when the event was modified',
  PRIMARY KEY (`id`),
  KEY `fk_event_creator_id` (`creator_id`),
  KEY `idx_timeline_event_timeline_id` (`timeline_id`),
  KEY `idx_timeline_event_timeline_id_timestamp` (`timeline_id`,`timestamp`),
  CONSTRAINT `fk_event_creator_id` FOREIGN KEY (`creator_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_events_timeline_id` FOREIGN KEY (`timeline_id`) REFERENCES `timeline` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Events table';
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `view_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `view_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `model` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL,
  `model_id` int NOT NULL,
  `timestamp` timestamp(6) NULL DEFAULT NULL,
  `metadata` longtext COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_view_log_user_id` (`user_id`),
  KEY `idx_view_log_timestamp` (`model_id`),
  CONSTRAINT `fk_view_log_ref_user_id` FOREIGN KEY (`user_id`) REFERENCES `core_user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

--
-- Metabase initialization data
--

-- v43.00-002 and v43.00-003;
INSERT INTO permissions_group (name) VALUES ('All Users'), ('Administrators');

-- v43.00-006;
INSERT INTO permissions (group_id, object) SELECT
  admin_group.id AS group_id,
  '/' AS object
FROM (
  SELECT id
  FROM permissions_group
  WHERE name = 'Administrators'
) admin_group;

-- v43.00-020;
INSERT INTO permissions (group_id, object) SELECT
  all_users_group.id AS group_id,
  '/collection/root/' AS object
FROM (
  SELECT id
  FROM permissions_group
  WHERE name = 'All Users'
) all_users_group;

-- v43.00-047 but change general => application because we renamed in v43.00-058;
INSERT INTO permissions (group_id, object) SELECT
  all_users_group.id AS group_id,
  '/application/subscription/' AS object
FROM (
  SELECT id
  FROM permissions_group
  WHERE name = 'All Users'
) all_users_group;

-- v44.00-033;
INSERT INTO permissions (group_id, object) SELECT
  all_users_group.id AS group_id,
  '/collection/namespace/snippets/root/' AS object
FROM (
  SELECT id
  FROM permissions_group
  WHERE name = 'All Users'
) all_users_group ;
