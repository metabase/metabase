import {useNavigate} from "react-router-dom"

export const LogoutButton = () => {

    const navigate = useNavigate()

    const onLogout = (e) => {
        e.preventDefault();

        return fetch("http://localhost:8081/logout", {
            method: "GET",
        })
            .then((response) => {
                console.log(response)
                if (response.status === 200) {
                    console.log(response.status)
                    navigate("/")
                }
            })
            .catch((error) => {
                console.error("Error:", error);
            });
    }

    return <button onClick={onLogout}>Logout</button>
}