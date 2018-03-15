/* @flow */

import React from "react";
import { Link } from "react-router";

import Icon from "metabase/components/Icon";
import MetabotLogo from "metabase/components/MetabotLogo";

import { t } from "c-3po";

import type { Candidate } from "metabase/meta/types/Auto";

const DEFAULT_TITLE = t`Hi, Metabot here.`;
const DEFAULT_DESCRIPTION = "";

export const ExplorePane = ({
  options,
  // $FlowFixMe
  title = DEFAULT_TITLE,
  // $FlowFixMe
  description = DEFAULT_DESCRIPTION,
}: {
  options?: ?(Candidate[]),
  title?: ?string,
  description?: ?string,
}) => (
  <div>
    {title && (
      <div className="flex align-center mb2">
        <MetabotLogo className="mr2" />
        <h3>
          <span>{title}</span>
        </h3>
      </div>
    )}
    {description && (
      <div className="mb4">
        <span>{description}</span>
      </div>
    )}
    {options && <ExploreList options={options} />}
  </div>
);

export const ExploreList = ({ options }: { options: Candidate[] }) => (
  <ol className="Grid Grid--1of2 Grid--gutters">
    {options &&
      options.map((option, index) => (
        <li className="Grid-cell" key={index}>
          <ExploreOption option={option} />
        </li>
      ))}
  </ol>
);

export const ExploreOption = ({ option }: { option: Candidate }) => (
  <Link to={option.url} className="link flex align-center text-bold">
    <div
      className="bg-slate-almost-extra-light p2 flex align-center rounded mr1 justify-center text-gold"
      style={{ width: 48, height: 48 }}
    >
      <Icon name="bolt" size={32} />
    </div>
    <span>{option.title}</span>
  </Link>
);

export default ExplorePane;
