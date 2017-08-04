import { Component } from 'react'
import { fetchDatabases } from 'metabase/redux/metadata'
import { connect } from 'react-redux'

class DatamodelApp extends Component {
    componentDidMount () {
        this.props.fetchDatabases()
    }
    render () {
        return this.props.children
    }
}

export default connect(null, { fetchDatabases })(DatamodelApp)
