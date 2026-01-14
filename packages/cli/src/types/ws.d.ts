import 'ws';

declare module 'ws' {
	interface WebSocket {
		isAlive: boolean;
	}
}
