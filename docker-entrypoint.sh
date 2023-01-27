#!/bin/sh

redis-server --daemonize yes &
node src/index.js
