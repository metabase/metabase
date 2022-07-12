import React from "react";

import { TemplateTags } from "metabase-types/types/Query";
import TagEditorParam from "metabase/query_builder/components/template_tags/TagEditorParam";
import { getDatabasesList } from "metabase/query_builder/selectors";
import { connect } from "react-redux";
import { State } from "metabase-types/store";
import { Database } from "metabase-types/types/Database";

type Props = {
  templateTags: TemplateTags;
  databases: Database[];

  onTemplateTagsChange: (templateTags: TemplateTags) => void;
};

const ParametersTab: React.FC<Props> = ({
  templateTags,
  databases,
  onTemplateTagsChange,
}) => {
  const tags = React.useMemo(() => Object.values(templateTags || {}), [
    templateTags,
  ]);
  const onChange = (templateTag: any) => {
    const { name } = templateTag;
    const newTag =
      templateTags[name] && templateTags[name].type !== templateTag.type
        ? // when we switch type, null out any default
          { ...templateTag, default: null }
        : templateTag;
    const newTags = { ...templateTags, [name]: newTag };
    onTemplateTagsChange(newTags);
  };
  return (
    <div>
      {tags.map(tag => (
        <div key={tag.name}>
          <TagEditorParam
            // For some reason typescript doesn't think the `tag` prop exists on TagEditorParam
            // @ts-ignore
            tag={tag}
            parameter={null}
            databaseFields={[]}
            database={null}
            databases={databases}
            setTemplateTag={onChange}
            setParameterValue={onChange}
          />
        </div>
      ))}
    </div>
  );
};

const mapStateToProps = (state: State) => ({
  databases: getDatabasesList(state),
});

export default connect(mapStateToProps)(ParametersTab);
