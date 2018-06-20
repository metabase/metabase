import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "c-3po";
import { Box, Flex } from "grid-styled";
import styled from "styled-components";
import { space, width } from "styled-system";

import { connect } from "react-redux";
import { push } from "react-router-redux";

import Button from "metabase/components/Button.jsx";
import Icon from "metabase/components/Icon.jsx";
import Link from "metabase/components/Link";
import LogoIcon from "metabase/components/LogoIcon.jsx";
import Tooltip from "metabase/components/Tooltip";
import OnClickOutsideWrapper from "metabase/components/OnClickOutsideWrapper";

import ProfileLink from "metabase/nav/components/ProfileLink.jsx";

import { getPath, getContext, getUser } from "../selectors";

const mapStateToProps = (state, props) => ({
  path: getPath(state, props),
  context: getContext(state, props),
  user: getUser(state),
});

const mapDispatchToProps = {
  onChangeLocation: push,
};

const AdminNavItem = ({ name, path, currentPath }) => (
  <li>
    <Link
      to={path}
      data-metabase-event={`NavBar;${name}`}
      className={cx("NavItem py1 px2 no-decoration", {
        "is--selected": currentPath.startsWith(path),
      })}
    >
      {name}
    </Link>
  </li>
);

const SearchWrapper = Flex.extend`
  ${width} border-radius: 6px;
  align-items: center;
  border: 1px solid transparent;
  transition: background 300ms ease-in;
`;

const SearchInput = styled.input`
  ${space} ${width} background-color: transparent;
  border: none;
  color: white;
  font-size: 1em;
  font-weight: 700;
  &:focus {
    outline: none;
  }
  &::placeholder {
    color: rgba(255, 255, 255, 0.85);
  }
`;

class SearchBar extends React.Component {
  state = {
    active: false,
    searchText: "",
  };

  componentWillMount() {
    this._updateSearchTextFromUrl(this.props);
  }
  componentWillReceiveProps(nextProps) {
    if (this.props.location.pathname !== nextProps.location.pathname) {
      this._updateSearchTextFromUrl(nextProps);
    }
  }
  _updateSearchTextFromUrl(props) {
    const components = props.location.pathname.split("/");
    if (components[components.length - 1] === "search") {
      this.setState({ searchText: props.location.query.q });
    } else {
      this.setState({ searchText: "" });
    }
  }

  render() {
    return (
      <OnClickOutsideWrapper
        handleDismissal={() => this.setState({ active: false })}
      >
        <SearchWrapper
          className={cx("search-bar", {
            "search-bar--active": this.state.active,
          })}
          onClick={() => this.setState({ active: true })}
          active={this.state.active}
        >
          <Icon name="search" ml={2} />
          <SearchInput
            w={1}
            p={2}
            value={this.state.searchText}
            placeholder="Search for anything..."
            onClick={() => this.setState({ active: true })}
            onChange={e => this.setState({ searchText: e.target.value })}
            onKeyPress={e => {
              if (e.key === "Enter") {
                this.props.onChangeLocation({
                  pathname: "search",
                  query: { q: this.state.searchText },
                });
              }
            }}
          />
        </SearchWrapper>
      </OnClickOutsideWrapper>
    );
  }
}

@connect(mapStateToProps, mapDispatchToProps)
export default class Navbar extends Component {
  state = {
    modal: null,
  };

  static propTypes = {
    context: PropTypes.string.isRequired,
    path: PropTypes.string.isRequired,
    user: PropTypes.object,
  };

  isActive(path) {
    return this.props.path.startsWith(path);
  }

  setModal(modal) {
    this.setState({ modal });
    if (this._newPopover) {
      this._newPopover.close();
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.location !== this.props.location) {
      this.setState({ modal: null });
      if (this._newPopover) {
        this._newPopover.close();
      }
    }
  }

  renderAdminNav() {
    return (
      <nav className={cx("Nav AdminNav sm-py1")}>
        <div className="sm-pl4 flex align-center pr1">
          <div className="NavTitle flex align-center">
            <Icon name={"gear"} className="AdminGear" size={22} />
            <span className="NavItem-text ml1 hide sm-show text-bold">{t`Metabase Admin`}</span>
          </div>

          <ul className="sm-ml4 flex flex-full">
            <AdminNavItem
              name={t`Settings`}
              path="/admin/settings"
              currentPath={this.props.path}
            />
            <AdminNavItem
              name={t`People`}
              path="/admin/people"
              currentPath={this.props.path}
            />
            <AdminNavItem
              name={t`Data Model`}
              path="/admin/datamodel"
              currentPath={this.props.path}
            />
            <AdminNavItem
              name={t`Databases`}
              path="/admin/databases"
              currentPath={this.props.path}
            />
            <AdminNavItem
              name={t`Permissions`}
              path="/admin/permissions"
              currentPath={this.props.path}
            />
          </ul>

          <ProfileLink {...this.props} />
        </div>
      </nav>
    );
  }

  renderEmptyNav() {
    return (
      <nav className="Nav sm-py1 relative">
        <ul className="wrapper flex align-center">
          <li>
            <Link
              to="/"
              data-metabase-event={"Navbar;Logo"}
              className="NavItem cursor-pointer flex align-center"
            >
              <LogoIcon className="text-brand my2" />
            </Link>
          </li>
        </ul>
      </nav>
    );
  }

  renderMainNav() {
    return (
      <Flex className="Nav relative bg-brand text-white z4" align="center">
        <Box>
          <Link
            to="/"
            data-metabase-event={"Navbar;Logo"}
            className="LogoNavItem NavItem cursor-pointer relative z2 flex align-center transition-background justify-center"
          >
            <LogoIcon dark />
          </Link>
        </Box>
        <Flex
          className="absolute top left right bottom z1"
          px={4}
          align="center"
        >
          <Box w={2 / 3}>
            <SearchBar
              location={this.props.location}
              onChangeLocation={this.props.onChangeLocation}
            />
          </Box>
        </Flex>
        <Flex align="center" ml="auto" className="z4">
          <Link to="question/new" mx={1}>
            <Button medium color="#509ee3">
              New question
            </Button>
          </Link>
          <Link to="collection/root" mx={1}>
            <Box p={1} bg="#69ABE6" className="text-bold rounded">
              Saved items
            </Box>
          </Link>
          <Tooltip tooltip={t`Reference`}>
            <Link to="reference" mx={1}>
              <Icon name="reference" />
            </Link>
          </Tooltip>
          <Tooltip tooltip={t`Activity`}>
            <Link to="activity" mx={1}>
              <Icon name="alert" />
            </Link>
          </Tooltip>
          <ProfileLink {...this.props} />
        </Flex>
      </Flex>
    );
  }

  render() {
    const { context, user } = this.props;

    if (!user) {
      return null;
    }

    switch (context) {
      case "admin":
        return this.renderAdminNav();
      case "auth":
        return null;
      case "none":
        return this.renderEmptyNav();
      case "setup":
        return null;
      default:
        return this.renderMainNav();
    }
  }
}
