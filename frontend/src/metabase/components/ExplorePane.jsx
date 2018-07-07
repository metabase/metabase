/* @flow */

import React from "react";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";
import MetabotLogo from "metabase/components/MetabotLogo";
import Select, { Option } from "metabase/components/Select";
import { Grid, GridItem } from "metabase/components/Grid";
import Card from "metabase/components/Card";

import { t } from "c-3po";
import _ from "underscore";

import type { DatabaseCandidates, Candidate } from "metabase/meta/types/Auto";

const DEFAULT_TITLE = t`Hi, Metabot here.`;
const DEFAULT_DESCRIPTION = "";

type Props = {
  candidates?: ?DatabaseCandidates,
  title?: ?string,
  description?: ?string,
  withMetabot: ?boolean,
  gridColumns: ?number,
  asCards: ?boolean,
};

type State = {
  schemaName: ?string,
  visibleItems: number,
};

const DEFAULT_VISIBLE_ITEMS = 4;

export class ExplorePane extends React.Component {
  props: Props;
  state: State = {
    schemaName: null,
    visibleItems: DEFAULT_VISIBLE_ITEMS,
  };
  static defaultProps = {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    withMetabot: true,
    gridColumns: 1 / 2,
    asCards: false,
  };

  render() {
    let {
      candidates,
      title,
      description,
      withMetabot,
      gridColumns,
      asCards,
    } = this.props;
    let { schemaName, visibleItems } = this.state;

    let schemaNames;
    let tables;
    let hasMore = false;
    if (candidates && candidates.length > 0) {
      schemaNames = candidates.map(schema => schema.schema);
      if (schemaName == null) {
        schemaName = schemaNames[0];
      }
      const schema = _.findWhere(candidates, { schema: schemaName });
      tables = (schema && schema.tables) || [];
    }

    return (
      <div className="pt4 pb2">
        {title && (
          <div className="flex align-center mb2">
            {withMetabot && <MetabotLogo />}
            <h3 className="ml2">
              <span className="block" style={{ marginTop: 8 }}>
                {title}
              </span>
            </h3>
          </div>
        )}
        {description && (
          <div className="mb2 text-paragraph">
            <span>{description}</span>
          </div>
        )}
        {schemaNames &&
          schemaNames.length > 1 && (
            <div className="px4 inline-block mb4">
              <div className="pb1 text-paragraph">
                Here's the schema I looked at:
              </div>
              <Select
                value={schemaName}
                onChange={e =>
                  this.setState({
                    schemaName: e.target.value,
                    visibleItems: DEFAULT_VISIBLE_ITEMS,
                  })
                }
              >
                {schemaNames.map(schemaName => (
                  <Option key={schemaName} value={schemaName}>
                    {schemaName}
                  </Option>
                ))}
              </Select>
            </div>
          )}
        {tables && (
          <ExploreList
            candidates={tables}
            gridColumns={gridColumns}
            asCards={asCards}
          />
        )}
        {hasMore && (
          <div
            className="border-top cursor-pointer text-brand-hover flex layout-centered text-grey-2 px2 pt2 mt4"
            onClick={() => this.setState({ visibleItems: visibleItems + 4 })}
          >
            <Icon name="chevrondown" size={20} />
          </div>
        )}
      </div>
    );
  }
}

export const ExploreList = ({
  candidates,
  gridColumns,
  asCards,
}: {
  candidates: Candidate[],
  gridColumns: ?number,
  asCards: ?boolean,
}) => (
  <Grid>
    {candidates &&
      candidates.map((option, index) => (
        <GridItem w={gridColumns} key={index}>
          {asCards ? (
            <Card hoverable p={2}>
              <ExploreOption option={option} />
            </Card>
          ) : (
            <ExploreOption option={option} />
          )}
        </GridItem>
      ))}
  </Grid>
);

export const ExploreOption = ({ option }: { option: Candidate }) => (
  <Link
    to={option.url}
    className="flex align-center text-bold no-decoration text-grey-5 text-brand-hover bg-grey-0 p2 py3"
  >
    <Icon
      name="bolt"
      size={20}
      className="flex-no-shrink mr1 justify-center text-gold"
    />
    <div>
      <span className="text-normal">{t`A look at your`}</span> {option.title}
    </div>
  </Link>
);

export default ExplorePane;
