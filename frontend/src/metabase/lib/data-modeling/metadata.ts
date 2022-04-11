export type FieldMetadata = {
  id?: number;
  name: string;
  display_name: string;
  description?: string | null;
  semantic_type?: string | null;
};

const MAX_FIELD_SCORE = 3;

/**
 * Calculates field metadata completeness score for individual column
 *
 * Score is an int value between 0 and 3
 * (where 0 is fully incomplete metadata and 1 is fully complete one)
 *
 * Each score "point" is granted when one of the requirements is met
 *
 * 1. No "→" and "_" characters in column name
 * 2. Field description is provided
 * 3. Field semantic type is set
 *
 * @param {FieldMetadata} field
 * @returns {number} — int between 0 and 3
 */
function getFieldMetadataScore({
  display_name,
  description,
  semantic_type,
}: FieldMetadata): number {
  let score = 0;

  const isNameDirty = display_name.includes("→") || display_name.includes("_");

  if (!isNameDirty) {
    score++;
  }
  if (description) {
    score++;
  }
  if (semantic_type) {
    score++;
  }

  return score;
}

/**
 * Calculates overall metadata completeness percent among given a list of field metadata
 *
 * @param {FieldMetadata[]}
 * @returns {number} — percent value between 0 and 1
 */
export function getDatasetMetadataCompletenessPercentage(
  fieldsMetadata: FieldMetadata[],
): number {
  if (!Array.isArray(fieldsMetadata) || fieldsMetadata.length === 0) {
    return 0;
  }

  const MAX_POINTS = MAX_FIELD_SCORE * fieldsMetadata.length;
  const points = fieldsMetadata
    .map(getFieldMetadataScore)
    .reduce((sum, fieldPoints) => sum + fieldPoints, 0);

  const percent = points / MAX_POINTS;
  return Math.round(percent * 100) / 100;
}
