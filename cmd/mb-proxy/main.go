// mb-proxy: Caddy Admin API helper for per-branch Metabase routing.
// Example usage:
//
//	go run ./cmd/mb-proxy add --host my-branch.metabase.localhost --frontend 3001 --backend 3002
//	go run ./cmd/mb-proxy add --host my-branch.metabase.localhost --backend 4000
//	go run ./cmd/mb-proxy remove --host my-branch.metabase.localhost
//	go run ./cmd/mb-proxy list
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const (
	defaultAdminURL = "http://127.0.0.1:2019"
)

type registry struct {
	Entries map[string]registryEntry `json:"entries"`
}

type registryEntry struct {
	Host     string `json:"host"`
	Server   string `json:"server"`
	Frontend string `json:"frontend,omitempty"`
	Backend  string `json:"backend,omitempty"`
	Updated  string `json:"updated"`
}

type caddyClient struct {
	baseURL string
	client  *http.Client
}

type httpServer struct {
	Listen []string `json:"listen"`
}

func main() {
	if len(os.Args) < 2 {
		fail(errors.New("expected subcommand: add | remove | list"))
	}

	fmt.Fprintf(os.Stderr, "[mb-proxy] subcommand=%s\n", os.Args[1])

	switch os.Args[1] {
	case "add":
		addCmd(os.Args[2:])
	case "remove":
		removeCmd(os.Args[2:])
	case "list":
		listCmd(os.Args[2:])
	case "ports":
		portsCmd(os.Args[2:])
	default:
		fail(fmt.Errorf("unknown subcommand %q (expected add | remove | list)", os.Args[1]))
	}
}

func addCmd(args []string) {
	fs := flag.NewFlagSet("add", flag.ExitOnError)
	var host, frontend, backend, admin, server, stateDir string
	fs.StringVar(&host, "host", "", "Fully-qualified host (e.g. feature-x.metabase.localhost)")
	fs.StringVar(&frontend, "frontend", "", "Frontend/WebSocket port (optional; requires --backend)")
	fs.StringVar(&backend, "backend", "", "Backend port (required)")
	fs.StringVar(&admin, "admin", envOrDefault("MB_PROXY_ADMIN", defaultAdminURL), "Caddy Admin API base URL (http://127.0.0.1:2019 or unix:///path)")
	fs.StringVar(&server, "server", os.Getenv("MB_PROXY_SERVER"), "Caddy HTTP server name (optional; auto-detected if empty)")
	fs.StringVar(&stateDir, "state-dir", os.Getenv("MB_PROXY_STATE_DIR"), "State directory (optional; auto-resolved if empty)")
	fs.Parse(args)

	if host == "" {
		fail(errors.New("--host is required"))
	}
	if backend == "" {
		fail(errors.New("--backend is required"))
	}
	if frontend != "" && backend == "" {
		fail(errors.New("--frontend requires --backend"))
	}

	stateDir, err := resolveStateDir(stateDir)
	if err != nil {
		fail(err)
	}
	fmt.Fprintf(os.Stderr, "[mb-proxy] state_dir=%s\n", stateDir)
	if err := os.MkdirAll(stateDir, 0o700); err != nil {
		fail(fmt.Errorf("create state dir: %w", err))
	}

	unlock, err := lockState(stateDir)
	if err != nil {
		fail(err)
	}
	defer func() {
		fmt.Fprintf(os.Stderr, "[mb-proxy] unlocking state\n")
		unlock()
	}()

	reg, err := loadRegistry(stateDir)
	if err != nil {
		fail(err)
	}

	client, err := newCaddyClient(admin)
	if err != nil {
		fail(err)
	}

	serverName, err := resolveServerName(client, server)
	if err != nil {
		fail(err)
	}

	routes, err := client.getRoutes(serverName)
	if err != nil {
		fail(err)
	}

	newRoute := buildRoute(host, frontend, backend)
	existingIdx := findRouteIndexForHost(routes, host)

	if existingIdx >= 0 {
		fmt.Fprintf(os.Stderr, "[mb-proxy] updating route host=%s server=%s index=%d\n", host, serverName, existingIdx)
		if err := client.putRoute(serverName, existingIdx, newRoute); err != nil {
			fail(err)
		}
		fmt.Printf("Updated route for %s on server %s (index %d)\n", host, serverName, existingIdx)
	} else {
		fmt.Fprintf(os.Stderr, "[mb-proxy] creating route host=%s server=%s\n", host, serverName)
		if err := client.postRoute(serverName, newRoute); err != nil {
			fail(err)
		}
		fmt.Printf("Added route for %s on server %s\n", host, serverName)
	}

	reg.Entries[host] = registryEntry{
		Host:     host,
		Server:   serverName,
		Frontend: frontend,
		Backend:  backend,
		Updated:  time.Now().Format(time.RFC3339),
	}
	if err := saveRegistry(stateDir, reg); err != nil {
		fail(err)
	}
}

func removeCmd(args []string) {
	fs := flag.NewFlagSet("remove", flag.ExitOnError)
	var host, admin, server, stateDir string
	fs.StringVar(&host, "host", "", "Fully-qualified host to remove")
	fs.StringVar(&admin, "admin", envOrDefault("MB_PROXY_ADMIN", defaultAdminURL), "Caddy Admin API base URL")
	fs.StringVar(&server, "server", os.Getenv("MB_PROXY_SERVER"), "Caddy HTTP server name (optional)")
	fs.StringVar(&stateDir, "state-dir", os.Getenv("MB_PROXY_STATE_DIR"), "State directory (optional)")
	fs.Parse(args)

	if host == "" {
		fail(errors.New("--host is required"))
	}

	stateDir, err := resolveStateDir(stateDir)
	if err != nil {
		fail(err)
	}
	fmt.Fprintf(os.Stderr, "[mb-proxy] state_dir=%s\n", stateDir)
	if err := os.MkdirAll(stateDir, 0o700); err != nil {
		fail(fmt.Errorf("create state dir: %w", err))
	}

	unlock, err := lockState(stateDir)
	if err != nil {
		fail(err)
	}
	defer func() {
		fmt.Fprintf(os.Stderr, "[mb-proxy] unlocking state\n")
		unlock()
	}()

	reg, err := loadRegistry(stateDir)
	if err != nil {
		fail(err)
	}

	client, err := newCaddyClient(admin)
	if err != nil {
		fail(err)
	}

	serverName := server
	if serverName == "" {
		if entry, ok := reg.Entries[host]; ok && entry.Server != "" {
			serverName = entry.Server
		}
	}
	serverName, err = resolveServerName(client, serverName)
	if err != nil {
		fail(err)
	}

	routes, err := client.getRoutes(serverName)
	if err != nil {
		fail(err)
	}
	idx := findRouteIndexForHost(routes, host)
	if idx >= 0 {
		fmt.Fprintf(os.Stderr, "[mb-proxy] deleting route host=%s server=%s index=%d\n", host, serverName, idx)
		if err := client.deleteRoute(serverName, idx); err != nil {
			fail(err)
		}
		fmt.Printf("Removed route for %s (index %d) from server %s\n", host, idx, serverName)
	} else {
		fmt.Printf("No route found for %s on server %s (nothing to remove)\n", host, serverName)
	}

	delete(reg.Entries, host)
	if err := saveRegistry(stateDir, reg); err != nil {
		fail(err)
	}

	if len(reg.Entries) == 0 {
		if err := stopCaddy(); err != nil {
			fmt.Fprintf(os.Stderr, "Warning: failed to stop Caddy (no hosts remaining): %v\n", err)
		} else {
			fmt.Println("Stopped Caddy (no hosts remaining)")
		}
	}
}

func listCmd(args []string) {
	fs := flag.NewFlagSet("list", flag.ExitOnError)
	var stateDir string
	fs.StringVar(&stateDir, "state-dir", os.Getenv("MB_PROXY_STATE_DIR"), "State directory (optional)")
	fs.Parse(args)

	stateDir, err := resolveStateDir(stateDir)
	if err != nil {
		fail(err)
	}
	fmt.Fprintf(os.Stderr, "[mb-proxy] state_dir=%s\n", stateDir)
	reg, err := loadRegistry(stateDir)
	if err != nil {
		fail(err)
	}
	if len(reg.Entries) == 0 {
		fmt.Println("No hosts registered.")
		return
	}
	for host, entry := range reg.Entries {
		target := entry.Backend
		if target == "" {
			target = "(none)"
		}
		fmt.Printf("%s -> %s (server=%s", host, target, entry.Server)
		if entry.Frontend != "" {
			fmt.Printf(", frontend=%s", entry.Frontend)
		}
		fmt.Printf(", updated=%s)\n", entry.Updated)
	}
}

func portsCmd(args []string) {
	fs := flag.NewFlagSet("ports", flag.ExitOnError)
	var count int
	fs.IntVar(&count, "count", 1, "Number of free ports to return")
	fs.Parse(args)

	if count <= 0 {
		fail(errors.New("--count must be >= 1"))
	}

	ports, err := getFreePorts(count)
	if err != nil {
		fail(err)
	}
	fmt.Println(strings.Join(ports, " "))
}

func getFreePorts(n int) ([]string, error) {
	var listeners []net.Listener
	var ports []string
	for i := 0; i < n; i++ {
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			for _, l := range listeners {
				_ = l.Close()
			}
			return nil, fmt.Errorf("get free port: %w", err)
		}
		listeners = append(listeners, ln)
		_, portStr, err := net.SplitHostPort(ln.Addr().String())
		if err != nil {
			for _, l := range listeners {
				_ = l.Close()
			}
			return nil, fmt.Errorf("parse port: %w", err)
		}
		if _, err := strconv.Atoi(portStr); err != nil {
			for _, l := range listeners {
				_ = l.Close()
			}
			return nil, fmt.Errorf("invalid port: %w", err)
		}
		ports = append(ports, portStr)
	}
	for _, l := range listeners {
		_ = l.Close()
	}
	return ports, nil
}

func resolveStateDir(override string) (string, error) {
	if override != "" {
		return override, nil
	}
	if v := os.Getenv("MB_PROXY_STATE_DIR"); v != "" {
		return v, nil
	}
	if v := os.Getenv("XDG_STATE_HOME"); v != "" {
		return filepath.Join(v, "mb-proxy"), nil
	}
	if runtime.GOOS == "darwin" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		return filepath.Join(home, "Library", "Application Support", "mb-proxy"), nil
	}
	if home, err := os.UserHomeDir(); err == nil {
		return filepath.Join(home, ".local", "state", "mb-proxy"), nil
	}
	return filepath.Join(os.TempDir(), "mb-proxy"), nil
}

func lockState(stateDir string) (func(), error) {
	lockPath := filepath.Join(stateDir, "registry.lock")
	deadline := time.Now().Add(5 * time.Second)
	staleAfter := 30 * time.Second
	fmt.Fprintf(os.Stderr, "[mb-proxy] acquiring lock at %s\n", lockPath)
	for {
		err := os.Mkdir(lockPath, 0o700)
		if err == nil {
			fmt.Fprintf(os.Stderr, "[mb-proxy] lock acquired\n")
			return func() { _ = os.Remove(lockPath) }, nil
		}
		if !errors.Is(err, os.ErrExist) {
			return nil, fmt.Errorf("lock state: %w", err)
		}

		// Handle stale locks: if the lock dir is old, remove it and retry.
		info, statErr := os.Stat(lockPath)
		if statErr == nil {
			if time.Since(info.ModTime()) > staleAfter {
				fmt.Fprintf(os.Stderr, "[mb-proxy] removing stale lock (age=%s)\n", time.Since(info.ModTime()))
				_ = os.Remove(lockPath)
				continue
			}
		}

		if time.Now().After(deadline) {
			return nil, errors.New("timed out waiting for registry lock")
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func loadRegistry(stateDir string) (registry, error) {
	path := filepath.Join(stateDir, "registry.json")
	r := registry{Entries: map[string]registryEntry{}}
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return r, nil
		}
		return r, fmt.Errorf("read registry: %w", err)
	}
	if len(data) == 0 {
		return r, nil
	}
	if err := json.Unmarshal(data, &r); err != nil {
		return r, fmt.Errorf("parse registry: %w", err)
	}
	if r.Entries == nil {
		r.Entries = map[string]registryEntry{}
	}
	return r, nil
}

func saveRegistry(stateDir string, r registry) error {
	path := filepath.Join(stateDir, "registry.json")
	tmp := path + ".tmp"
	data, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return fmt.Errorf("serialize registry: %w", err)
	}
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return fmt.Errorf("write registry: %w", err)
	}
	return os.Rename(tmp, path)
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func newCaddyClient(admin string) (*caddyClient, error) {
	if admin == "" {
		admin = defaultAdminURL
	}
	if strings.HasPrefix(admin, "unix://") || strings.HasPrefix(admin, "unix:") {
		socket := strings.TrimPrefix(admin, "unix://")
		socket = strings.TrimPrefix(socket, "unix:")
		tr := &http.Transport{
			DialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
				return net.Dial("unix", socket)
			},
		}
		return &caddyClient{baseURL: "http://unix", client: &http.Client{Transport: tr, Timeout: 5 * time.Second}}, nil
	}
	return &caddyClient{baseURL: strings.TrimRight(admin, "/"), client: &http.Client{Timeout: 5 * time.Second}}, nil
}

func (c *caddyClient) get(path string) (*http.Response, error) {
	req, err := http.NewRequest("GET", c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	return c.client.Do(req)
}

func (c *caddyClient) postJSON(path string, body any) (*http.Response, error) {
	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest("POST", c.baseURL+path, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return c.client.Do(req)
}

func (c *caddyClient) putJSON(path string, body any) (*http.Response, error) {
	data, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest("PUT", c.baseURL+path, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	return c.client.Do(req)
}

func (c *caddyClient) delete(path string) (*http.Response, error) {
	req, err := http.NewRequest("DELETE", c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	return c.client.Do(req)
}

func ensureSuccess(resp *http.Response, body []byte) error {
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	return fmt.Errorf("caddy admin responded %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
}

func (c *caddyClient) getServers() (map[string]httpServer, error) {
	resp, err := c.get("/config/apps/http/servers")
	if err != nil {
		return nil, fmt.Errorf("fetch servers: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusNotFound {
		return map[string]httpServer{}, nil
	}
	if err := ensureSuccess(resp, body); err != nil {
		return nil, err
	}
	var servers map[string]httpServer
	if err := json.Unmarshal(body, &servers); err != nil {
		return nil, fmt.Errorf("parse servers: %w", err)
	}
	return servers, nil
}

func (c *caddyClient) getRoutes(server string) ([]map[string]any, error) {
	resp, err := c.get("/config/apps/http/servers/" + server + "/routes")
	if err != nil {
		return nil, fmt.Errorf("fetch routes: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusNotFound {
		return []map[string]any{}, nil
	}
	if err := ensureSuccess(resp, body); err != nil {
		return nil, err
	}
	var routes []map[string]any
	if len(body) == 0 {
		return []map[string]any{}, nil
	}
	if err := json.Unmarshal(body, &routes); err != nil {
		return nil, fmt.Errorf("parse routes: %w", err)
	}
	return routes, nil
}

func (c *caddyClient) postRoute(server string, route map[string]any) error {
	resp, err := c.postJSON("/config/apps/http/servers/"+server+"/routes", route)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return ensureSuccess(resp, body)
}

func (c *caddyClient) putRoute(server string, idx int, route map[string]any) error {
	resp, err := c.putJSON(fmt.Sprintf("/config/apps/http/servers/%s/routes/%d", server, idx), route)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return ensureSuccess(resp, body)
}

func (c *caddyClient) deleteRoute(server string, idx int) error {
	resp, err := c.delete(fmt.Sprintf("/config/apps/http/servers/%s/routes/%d", server, idx))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusNotFound {
		return nil
	}
	return ensureSuccess(resp, body)
}

func resolveServerName(client *caddyClient, override string) (string, error) {
	if override != "" {
		return override, nil
	}
	servers, err := client.getServers()
	if err != nil {
		return "", err
	}
	if len(servers) == 0 {
		return "", errors.New("no HTTP servers configured in Caddy; start Caddy with your base config first")
	}
	for name, srv := range servers {
		for _, ln := range srv.Listen {
			if strings.Contains(ln, ":80") {
				return name, nil
			}
		}
	}
	for name := range servers {
		return name, nil
	}
	return "", errors.New("no HTTP server found")
}

func findRouteIndexForHost(routes []map[string]any, host string) int {
	for i, r := range routes {
		matchVal, ok := r["match"]
		if !ok {
			continue
		}
		matchSlice, ok := matchVal.([]any)
		if !ok {
			continue
		}
		for _, m := range matchSlice {
			mm, ok := m.(map[string]any)
			if !ok {
				continue
			}
			hostVal, ok := mm["host"]
			if !ok {
				continue
			}
			hostSlice, ok := hostVal.([]any)
			if !ok {
				continue
			}
			for _, h := range hostSlice {
				if hs, ok := h.(string); ok && hs == host {
					return i
				}
			}
		}
	}
	return -1
}

func buildRoute(host, frontend, backend string) map[string]any {
	var innerRoutes []map[string]any

	// Preflight (OPTIONS)
	innerRoutes = append(innerRoutes, map[string]any{
		"match": []map[string]any{{"method": []string{"OPTIONS"}}},
		"handle": []map[string]any{
			corsHeaders(true),
			{"handler": "static_response", "status_code": 204},
		},
		"terminal": true,
	})

	// Websocket route to frontend if provided
	if frontend != "" {
		innerRoutes = append(innerRoutes, map[string]any{
			"match": []map[string]any{{
				"header": map[string]any{
					"Connection": []string{"*Upgrade*"},
					"Upgrade":    []string{"websocket"},
				},
			}},
			"handle": []map[string]any{
				corsHeaders(false),
				reverseProxyHandler(frontend),
			},
			"terminal": true,
		})
	}

	// Default route to backend
	innerRoutes = append(innerRoutes, map[string]any{
		"handle": []map[string]any{
			corsHeaders(false),
			reverseProxyHandler(backend),
		},
	})

	return map[string]any{
		"match":    []map[string]any{{"host": []string{host}}},
		"handle":   []map[string]any{{"handler": "subroute", "routes": innerRoutes}},
		"terminal": true,
	}
}

func corsHeaders(preflight bool) map[string]any {
	set := map[string]any{
		"Access-Control-Allow-Origin":      []string{"{http.request.header.origin}"},
		"Access-Control-Expose-Headers":    []string{"Authorization"},
		"Access-Control-Allow-Credentials": []string{"true"},
		"Vary":                             []string{"Origin"},
	}
	if preflight {
		set["Access-Control-Allow-Methods"] = []string{"GET, POST, PUT, PATCH, DELETE"}
		set["Access-Control-Max-Age"] = []string{"3600"}
	}
	return map[string]any{
		"handler": "headers",
		"response": map[string]any{
			"set": set,
		},
	}
}

func reverseProxyHandler(portOrAddress string) map[string]any {
	target := portOrAddress
	if !strings.Contains(target, ":") {
		target = "127.0.0.1:" + target
	}
	return map[string]any{
		"handler": "reverse_proxy",
		"upstreams": []map[string]any{
			{"dial": target},
		},
	}
}

func fail(err error) {
	fmt.Fprintf(os.Stderr, "Error: %v\n", err)
	os.Exit(1)
}

func stopCaddy() error {
	cmd := exec.Command("caddy", "stop")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("caddy stop: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	return nil
}
