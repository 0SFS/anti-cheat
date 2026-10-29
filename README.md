# Anti-cheat

The envelope for a multiplayer session.

The server watcher runs on every pose, burst and launch, and drops a pilot after three failures. The flight server in `@0sfs/multiplayer-server` calls that watcher before relaying. The client watcher runs the same checks only while a pilot has turned it on, and only reports. Neither watcher changes the flight model.

The implementation spec is [docs/implementation.md](docs/implementation.md). Messages come from `@0sfs/multiplayer`.

The fly app depends on this package and runs its tests. From the `fly` directory, `npm test` includes them.

## Community

- [Code of conduct](https://github.com/0SFS/.github/blob/main/CODE_OF_CONDUCT.md)
- [Contributing](https://github.com/0SFS/.github/blob/main/CONTRIBUTING.md)
- [License](LICENSE)
- [Security](https://github.com/0SFS/.github/blob/main/SECURITY.md)
