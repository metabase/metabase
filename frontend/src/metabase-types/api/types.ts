/**
 * Data types — descendants of type/* in the Metabase type hierarchy.
 * Used for base_type and effective_type fields.
 *
 * @see {@link SemanticTypeName} for semantic/relation types used in semantic_type fields.
 */
export type BaseTypeName =
  | "type/Array"
  | "type/BigInteger"
  | "type/Boolean"
  | "type/CaseInsensitiveText"
  | "type/Collection"
  | "type/Date"
  | "type/DateTime"
  | "type/DateTimeWithLocalTZ"
  | "type/DateTimeWithTZ"
  | "type/DateTimeWithZoneID"
  | "type/DateTimeWithZoneOffset"
  | "type/Decimal"
  | "type/Dictionary"
  | "type/DruidHyperUnique"
  | "type/DruidJSON"
  | "type/Float"
  | "type/HasDate"
  | "type/HasTime"
  | "type/Instant"
  | "type/Integer"
  | "type/Interval"
  | "type/JSON"
  | "type/MongoBinData"
  | "type/MongoBSONID"
  | "type/MySQLEnum"
  | "type/Number"
  | "type/OracleCLOB"
  | "type/PostgresBitString"
  | "type/PostgresEnum"
  | "type/SnowflakeVariant"
  | "type/Structured"
  | "type/Temporal"
  | "type/Text"
  | "type/TextLike"
  | "type/Time"
  | "type/TimeWithLocalTZ"
  | "type/TimeWithTZ"
  | "type/TimeWithZoneOffset"
  | "type/UUID"
  | "type/XML";

/**
 * Semantic and relation types — descendants of Semantic/* and Relation/* in the Metabase type hierarchy.
 * Used for semantic_type fields.
 *
 * Note: some semantic types also derive from data types (e.g. type/Currency derives
 * from type/Decimal), but in practice they only appear in the semantic_type field.
 *
 * @see {@link BaseTypeName} for data types used in base_type and effective_type fields.
 */
export type SemanticTypeName =
  | "type/Address"
  | "type/Author"
  | "type/AvatarURL"
  | "type/Birthdate"
  | "type/CancelationDate"
  | "type/CancelationTemporal"
  | "type/CancelationTime"
  | "type/CancelationTimestamp"
  | "type/Category"
  | "type/City"
  | "type/Comment"
  | "type/Company"
  | "type/Coordinate"
  | "type/Cost"
  | "type/Country"
  | "type/CreationDate"
  | "type/CreationTemporal"
  | "type/CreationTime"
  | "type/CreationTimestamp"
  | "type/Currency"
  | "type/DeletionDate"
  | "type/DeletionTemporal"
  | "type/DeletionTime"
  | "type/DeletionTimestamp"
  | "type/Description"
  | "type/Discount"
  | "type/Duration"
  | "type/Email"
  | "type/Enum"
  | "type/FK"
  | "type/GrossMargin"
  | "type/IPAddress"
  | "type/ImageURL"
  | "type/Income"
  | "type/JoinDate"
  | "type/JoinTemporal"
  | "type/JoinTime"
  | "type/JoinTimestamp"
  | "type/Latitude"
  | "type/Location"
  | "type/Longitude"
  | "type/Name"
  | "type/Owner"
  | "type/PK"
  | "type/Percentage"
  | "type/Price"
  | "type/Product"
  | "type/Quantity"
  | "type/Score"
  | "type/SerializedJSON"
  | "type/Share"
  | "type/Source"
  | "type/State"
  | "type/Structured"
  | "type/Subscription"
  | "type/Title"
  | "type/URL"
  | "type/UpdatedDate"
  | "type/UpdatedTemporal"
  | "type/UpdatedTime"
  | "type/UpdatedTimestamp"
  | "type/User"
  | "type/ZipCode";

/**
 * Union of all Metabase type names (data types + semantic types + relation types).
 */
export type MetabaseTypeName = BaseTypeName | SemanticTypeName;
