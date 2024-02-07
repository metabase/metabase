export const AuthButton = () => {
    const onAuth = () => {
        fetch("http://localhost:8081/sso/metabase", {
            method: "GET",
            credentials: "include",
        })
            .then((response) => response.json())
            .then((data) => {
                console.log(data)
            })
    }


    return <button onClick={onAuth}>AuthButton</button>
}