/* eslint-disable react/prop-types */
import {
  BrowserCrumbsIcon,
  BrowserCrumbsItem,
  BrowserCrumbsLink,
  BrowserCrumbsRoot,
} from "./BrowserCrumbs.styled";

// TODO: merge with Breadcrumbs

const Crumb = ({ children }) => (
  <h5 className="text-uppercase text-medium" style={{ fontWeight: 900 }}>
    {children}
  </h5>
);

const BrowserCrumbs = ({ crumbs, analyticsContext }) => (
  <BrowserCrumbsRoot data-testid="browsercrumbs">
    {crumbs
      .filter(c => c)
      .map((crumb, index, crumbs) => (
        <BrowserCrumbsItem key={index}>
          {crumb.to ? (
            <BrowserCrumbsLink
              to={crumb.to}
              data-metabase-event={`${analyticsContext};Bread Crumb;Click`}
            >
              <Crumb>{crumb.title}</Crumb>
            </BrowserCrumbsLink>
          ) : (
            <Crumb>{crumb.title}</Crumb>
          )}
          {index < crumbs.length - 1 ? (
            <BrowserCrumbsIcon name="chevronright" />
          ) : null}
        </BrowserCrumbsItem>
      ))}
  </BrowserCrumbsRoot>
);

export default BrowserCrumbs;
