# Memory Optimization for Builds

This document explains how to handle JavaScript heap out of memory errors during builds in the n8n monorepo.

## Problem

Some packages, particularly `@n8n/chat`, may encounter "JavaScript heap out of memory" errors during the build process. This typically happens when building large applications that require more memory than the default Node.js heap limit.

## Solution

The memory issue has been resolved by implementing automatic memory optimization across the entire monorepo.

### Automatic Memory Optimization

The following changes have been implemented:

1. **Root package.json**: The main build command now automatically uses increased memory
2. **Root .npmrc**: Global Node.js memory settings
3. **Package-specific .npmrc**: Individual package memory settings
4. **Vite configuration**: Build optimizations for the chat package

### Usage

Simply run the build command as usual - memory optimization is now automatic:

```bash
# Build all packages with increased memory (automatic)
pnpm run build

# Build specific packages
pnpm run build --filter=@n8n/chat
pnpm run build --filter=@n8n/design-system

# Build multiple packages
pnpm run build --filter=@n8n/chat --filter=@n8n/design-system
```

## Environment Variables

The following environment variables are automatically set:

- `NODE_OPTIONS=--max-old-space-size=8192` (8GB heap limit)
- This is configured in `.npmrc` files at both root and package levels

## Package-Specific Optimizations

The `@n8n/chat` package has been updated with:

- Memory-optimized build scripts
- Vite configuration optimizations
- Package-specific `.npmrc` with memory settings

## Vite Build Optimizations

The Vite configuration for `@n8n/chat` includes:

- `minify: 'esbuild'` - Faster minification
- `target: 'es2020'` - Modern target for better optimization
- `chunkSizeWarningLimit: 2000` - Increased chunk size limit
- Optimized chunk naming and splitting

## Manual Memory Increase (if needed)

If you need to manually increase memory for a specific command:

```bash
# Increase to 8GB
NODE_OPTIONS="--max-old-space-size=8192" pnpm run build

# Increase to 16GB (if you have enough RAM)
NODE_OPTIONS="--max-old-space-size=16384" pnpm run build
```

## Troubleshooting

### Still Getting Memory Errors?

1. **Increase memory limit further:**
   ```bash
   NODE_OPTIONS="--max-old-space-size=16384" pnpm run build
   ```

2. **Build packages individually:**
   ```bash
   pnpm --filter @n8n/chat run build
   ```

3. **Clear cache and rebuild:**
   ```bash
   pnpm run clean
   pnpm run build
   ```

4. **Check available system memory:**
   ```bash
   free -h
   ```

### System Requirements

- **Minimum RAM:** 8GB
- **Recommended RAM:** 16GB or more
- **Node.js version:** 22.16 or higher

## Package-Specific Builds

To build only the chat package with memory optimization:

```bash
cd packages/frontend/@n8n/chat
NODE_OPTIONS="--max-old-space-size=8192" pnpm run build
```

Or use the filtered build:

```bash
pnpm run build --filter=@n8n/chat
```

## What Was Fixed

The original issue was caused by:

1. **Insufficient heap memory** for large builds
2. **Complex dependency trees** requiring more memory during bundling
3. **Vite build process** running out of memory during transformation

The solution provides:

1. **Automatic memory allocation** (8GB by default)
2. **Build optimizations** in Vite configuration
3. **Global configuration** through .npmrc files
4. **Seamless integration** with existing build commands
