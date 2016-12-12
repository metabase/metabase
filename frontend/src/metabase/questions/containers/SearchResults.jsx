import React, { Component } from "react";
import HeaderWithBack from "metabase/components/HeaderWithBack";

import CollectionActions from "../components/CollectionActions";
import ExpandingSearchField from "../components/ExpandingSearchField";

class SearchResults extends Component {
    render () {
        return (
            <div className="px4 pt3 flex align-center">
                <HeaderWithBack name="Search results" />
                <div className="ml-auto flex align-center">
                    <ExpandingSearchField active={true} />
                    <CollectionActions
                        actions={[
                            { name: 'Archive collection', icon: 'archive',  action: () => console.log('archive!') },
                            { name: 'Edit collection', icon: 'pencil',  action: () => console.log('edit!!') },
                        ]}
                    />
                </div>
            </div>
        );
    }
}

export default SearchResults;
