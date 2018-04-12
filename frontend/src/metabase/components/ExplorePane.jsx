/* @flow */

import React from "react";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";
import MetabotLogo from "metabase/components/MetabotLogo";
import Select, { Option } from "metabase/components/Select";

import { t } from "c-3po";
import _ from "underscore";

import type { Candidate } from "metabase/meta/types/Auto";

const DEFAULT_TITLE = t`Hi, Metabot here.`;
const DEFAULT_DESCRIPTION = "";

type Props = {
  candidates?: ?(Candidate[]),
  title?: ?string,
  description?: ?string,
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
  };

  render() {
    let { candidates, title, description } = this.props;
    let { schemaName, visibleItems } = this.state;

    let schemaNames;
    let hasMore = false;
    if (candidates) {
      const candidatesBySchema =
        candidates &&
        _.groupBy(
          candidates,
          candidate => candidate.table && candidate.table.schema,
        );
      schemaNames = Object.keys(candidatesBySchema || {});
      if (schemaName == null) {
        schemaName = schemaNames[0];
      }
      candidates = candidatesBySchema[schemaName].slice(0, visibleItems);
      hasMore = visibleItems < candidatesBySchema[schemaName].length;
    }

    return (
      <div className="pt4 pb2">
        {title && (
          <div className="px4 flex align-center mb2">
            <MetabotLogo />
            <h3 className="ml2">
              <span className="block" style={{ marginTop: 8 }}>
                {title}
              </span>
            </h3>
          </div>
        )}
        {description && (
          <div className="px4 mb4 text-paragraph">
            <span>{description}</span>
          </div>
        )}
        {schemaNames &&
          schemaNames.length > 1 && (
            <div className="px4 inline-block mb4">
              <div className="pb1 text-paragraph">Here's the schema I looked at:</div>
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
        {candidates && (
          <div className="px4">
            <ExploreList candidates={candidates} />
          </div>
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

export const ExploreList = ({ candidates }: { candidates: Candidate[] }) => (
  <ol className="Grid Grid--1of2 Grid--gutters">
    {candidates &&
      candidates.map((option, index) => (
        <li className="Grid-cell" key={index}>
          <ExploreOption option={option} />
        </li>
      ))}
  </ol>
);

export const ExploreOption = ({ option }: { option: Candidate }) => (
  <Link to={option.url} className="link flex align-center text-bold">
    <div
      className="bg-grey-0 flex align-center rounded mr1 p2 justify-center text-gold"
      style={{ width: 48, height: 48 }}
    >
      <Icon name="bolt" size={24} className="flex-no-shrink" />
    </div>
    <span>{option.title}</span>
  </Link>
);

export default ExplorePane;
