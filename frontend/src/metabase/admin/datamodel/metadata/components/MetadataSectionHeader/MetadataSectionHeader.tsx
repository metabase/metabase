interface MetadataSectionHeaderProps {
  title: string;
  description?: string;
}

export const MetadataSectionHeader = ({
  title,
  description,
}: MetadataSectionHeaderProps) => (
  <div className="mb2">
    <h4>{title}</h4>
    {description && <p className="mb0 text-medium mt1">{description}</p>}
  </div>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MetadataSectionHeader;
