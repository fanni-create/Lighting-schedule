{
  "buildCommand": "npm run vercel-build",
  "outputDirectory": "build",
  "functions": {
    "api/convert-pdf.py": {
      "maxDuration": 60,
      "memory": 1024
    },
    "api/sync.py": {
      "maxDuration": 10,
      "memory": 256
    }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/$1" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
