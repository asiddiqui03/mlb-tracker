import json
from pybaseball import team_batting, cache

def main():
    try:
        # Enable pybaseball caching to avoid repeated ~1 minute network calls
        cache.enable()
        
        # Fetch only the current/latest complete season (2024) to avoid timeouts
        data = team_batting(2024)
        data = data.fillna(0)
        
        # Replace 'Team' with standard abbreviations if needed, but pybaseball uses standard abbreviations (e.g. 'NYY')
        json_data = data.to_json(orient='records')
        print(json_data)
    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == '__main__':
    main()
