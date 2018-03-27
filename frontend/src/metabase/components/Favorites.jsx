import React from "react";
import { Box, Subhead } from "rebass";
import { Link } from "react-router";

class FavoritesLoader extends React.Component {
  state = {
    favorites: null,
    loading: false,
    error: null,
  };

  componentWillMount() {
    this._loadFavorites();
  }

  async _loadFavorites() {
    try {
      this.setState({ loading: true });
    } catch (error) {
      this.setState({ error, loading: false });
    }
  }

  render() {
    const { children } = this.props;
    const { favorites, loading, error } = this.state;
    return children && children({ favorites, loading, error });
  }
}

const Favorites = () => (
  <Box>
    <Subhead>Favorites</Subhead>
    <FavoritesLoader>
      {({ favorites, loading, error }) => {
        if (loading) {
          return <Box>Loading...</Box>;
        }
        return favorites.map(favorite => <Link>{favorite.name}</Link>);
      }}
    </FavoritesLoader>
  </Box>
);

export default Favorites;
