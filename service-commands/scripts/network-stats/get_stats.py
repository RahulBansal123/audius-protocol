#!/usr/bin/env python3

import json
from json.decoder import JSONDecodeError
import os
from pprint import pprint

import requests
from requests.exceptions import ReadTimeout

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def parse_service_provider_list():
    service_provider_list = []
    with open(os.path.join(SCRIPT_DIR, "service_provider_list.json")) as f:
        service_provider_list = json.load(f)
    return service_provider_list


def parse_stats():
    stats = []
    with open(os.path.join(SCRIPT_DIR, "stats.json")) as f:
        stats = json.load(f)
    return stats


def get_health_check(endpoint):
    r = requests.get(endpoint + "/health_check", timeout=3)
    return r.json()


def size(bytes):
    return round(bytes / 1024 / 1024 / 1024)


def report_stats(service_provider_list):
    stats = []
    for sp in service_provider_list:
        try:
            health = get_health_check(sp["endpoint"])
        except (ReadTimeout, JSONDecodeError):
            continue

        try:
            stat = {
                "id": sp["spID"],
                "block_difference": health["data"]["block_difference"],
                "version": health["version"]["version"],
                "size_database_gb": size(health["data"]["database_size"]),
                "size_filesystem_gb": size(health["data"]["filesystem_size"]),
                "size_filesystem_used_gb": size(health["data"]["filesystem_used"]),
                "size_filesystem_free_gb": size(
                    health["data"]["filesystem_size"]
                    - health["data"]["filesystem_used"]
                ),
                "meets_min_requirements": health["data"]["meets_min_requirements"],
                "cpu_count": health["data"]["number_of_cpus"],
                "memory_redis_gb": size(health["data"]["redis_total_memory"]),
                "memory_gb": size(health["data"]["total_memory"]),
                "memory_used_gb": size(health["data"]["used_memory"]),
                "memory_free_gb": size(
                    health["data"]["total_memory"] - health["data"]["used_memory"]
                ),
            }
            stats += [stat]
        except:
            pass
    return stats


def generate_stats_json():
    service_provider_list = parse_service_provider_list()
    stats = report_stats(service_provider_list)
    with open(os.path.join(SCRIPT_DIR, "stats.json"), "w") as f:
        f.write(json.dumps(stats))
        f.close()


def show_cluster_wide_stats():
    stats = parse_stats()
    for key in stats[0].keys():
        key_stats = []
        for stat in stats:
            key_stats += [stat[key]]

        key_stats.sort()
        print("{}\n".format(key))
        print("{}\n\n".format(key_stats))


def main():
    generate_stats_json()
    show_cluster_wide_stats()


if __name__ == "__main__":
    main()
